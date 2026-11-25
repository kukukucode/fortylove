import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canUseChatbot, chatbotSourcesForAudience, type ChatbotRole } from "@/lib/chatbot-access";
import {
  allowsGeneralAnswer,
  contextualizeQuestion,
  knowledgeSource,
  knowledgeCitation,
  mergeKnowledgeCandidates,
  decideKnowledgeResponse,
  isEventQuestion,
  type ChatbotKnowledge,
} from "@/lib/chatbot";
import { generateGroundedAnswer } from "@/lib/gemini-chatbot";
import { matchChatbotTopics, normalizeChatbotLookupText } from "@/lib/chatbot-keywords";

import { readKnowledge } from "@/lib/server/knowledge-data";
import { answerEvents } from "@/lib/server/chatbot-events";
import { embedTexts } from "@/lib/embeddings";
import { issueGeneralTicket, verifyGeneralTicket } from "@/lib/server/general-answer-ticket";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(500),
  audience: z.enum(["admin", "member"]).optional(),
  generalTicket: z.string().max(5000).optional(),
  choiceId: z.string().uuid().optional(),
  history: z.array(z.string().trim().min(1).max(500)).max(4).optional(),
});

function choiceResponse(records: ChatbotKnowledge[], generalTicket?: string) {
  const choices = records.slice(0, 3);
  return NextResponse.json({
    answer: "質問に近い内容が見つかりました。気になるものを選んでくださいね。",
    source: "Markdown回答候補",
    kind: "choices",
    generalTicket,
    choices: choices.map((record, index) => ({
      id: record.id,
      label: String(index + 1),
      title: record.title,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  const client = db();

  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "質問は500文字以内で入力してください。" }, { status: 400 });

  const role = session.role as ChatbotRole;
  const { data: settings } = await client
    .from("app_settings")
    .select(
      "chatbot_admin_enabled,chatbot_member_enabled,chatbot_admin_sources,chatbot_member_sources,chatbot_fallback_message",
    )
    .eq("id", 1)
    .maybeSingle();
  if (!canUseChatbot(role, settings))
    return NextResponse.json({ error: "チャットBotの利用は許可されていません。" }, { status: 403 });
  const audience =
    role === "super_admin"
      ? (input.data.audience ?? "member")
      : role === "admin"
        ? "admin"
        : "member";
  const sourceNames = chatbotSourcesForAudience(audience, settings);
  if (
    input.data.generalTicket &&
    (!allowsGeneralAnswer(input.data.message) ||
      !verifyGeneralTicket(input.data.generalTicket, session.id, audience, input.data.message))
  ) {
    return NextResponse.json(
      { error: "この質問の一般回答は利用できません。もう一度質問してください。" },
      { status: 400 },
    );
  }
  if (role !== "super_admin") {
    const usageDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const { data: consumed, error: usageError } = await client.rpc("consume_chatbot_message", {
      p_user_id: session.id,
      p_usage_date: usageDate,
    });
    if (usageError)
      return NextResponse.json(
        { error: "利用回数を確認できませんでした。時間をおいてお試しください。" },
        { status: 503 },
      );
    if (!consumed)
      return NextResponse.json(
        {
          answer: "本日のチャット利用上限（10件）に達しました。",
          source: "1日10件まで",
          kind: "daily-limit",
          offerEscalation: true,
        },
        { status: 429 },
      );
  }

  if (input.data.generalTicket) {
    let diagnostic: string | undefined;
    const answer = await generateGroundedAnswer(input.data.message, [], {
      general: true,
      audience,
      ...(role === "super_admin"
        ? { onFailure: (reason: string) => {
            diagnostic = reason;
          } }
        : {}),
    });
    return NextResponse.json({
      answer: answer
        ? `Fortyloveの公式回答ではありません。一般的な参考情報です。\n\n${answer}`
        : `一般的な回答を取得できませんでした。${diagnostic ?? "運営スタッフにご相談ください。"}`,
      kind: "general",
      offerEscalation: !answer,
    });
  }
  const question = input.data.choiceId
    ? input.data.message
    : contextualizeQuestion(input.data.message, input.data.history);
  if (!input.data.choiceId && isEventQuestion(question)) {
    try {
      return NextResponse.json({ answer: await answerEvents(question), kind: "event" });
    } catch {
      return NextResponse.json(
        { error: "開催情報を確認できませんでした。時間をおいてお試しください。" },
        { status: 503 },
      );
    }
  }
  let knowledge: ChatbotKnowledge[];
  const searchQuestion = input.data.choiceId ? question : normalizeChatbotLookupText(question);
  try {
    knowledge = await readKnowledge(sourceNames, searchQuestion, undefined, input.data.choiceId);
  } catch {
    return NextResponse.json(
      { error: "回答資料を確認できませんでした。時間をおいてお試しください。" },
      { status: 503 },
    );
  }

  if (input.data.choiceId) {
    const selected = knowledge.find((record) => record.id === input.data.choiceId);
    if (!selected)
      return NextResponse.json(
        { error: "選択肢を確認できませんでした。もう一度質問してください。" },
        { status: 400 },
      );
    return NextResponse.json({
      answer: selected.content,
      source: knowledgeSource(selected),
      citations: [knowledgeCitation(selected)],
      kind: "knowledge",
    });
  }

  let decision = decideKnowledgeResponse(question, knowledge);
  if (decision.kind !== "direct") {
    try {
      // Interactive chat must not inherit the long retry policy used by bulk imports.
      // If Gemini is busy, keyword retrieval remains available immediately.
      const [vector] = await embedTexts([question], true, undefined, undefined, {
        maxAttempts: 1,
        requestTimeoutMs: 4_000,
      });
      const candidates = await readKnowledge(sourceNames, searchQuestion, vector);
      decision = decideKnowledgeResponse(question, mergeKnowledgeCandidates(knowledge, candidates));
    } catch {
      /* Keyword retrieval remains available when the embedding service is unavailable. */
    }
  }
  if (decision.kind === "direct") {
    return NextResponse.json({
      answer: decision.record.content,
      source: knowledgeSource(decision.record),
      citations: [knowledgeCitation(decision.record)],
      kind: "knowledge",
    });
  }
  let choices: ChatbotKnowledge[] = [];
  if (decision.kind === "synthesize") {
    const synthesized = await generateGroundedAnswer(question, decision.records, { audience });
    if (synthesized) {
      return NextResponse.json({
        answer: synthesized,
        source: decision.records.map(knowledgeSource).join("、"),
        citations: decision.records.map(knowledgeCitation),
        kind: "gemini",
      });
    }
    if (decision.records.length > 1) {
      choices = matchChatbotTopics(question, decision.records);
    }
  }

  const originalQuestion = input.data.message;
  const generalTicket =
    allowsGeneralAnswer(originalQuestion) && allowsGeneralAnswer(question)
      ? issueGeneralTicket(session.id, audience, originalQuestion)
      : undefined;
  if (choices.length) return choiceResponse(choices, generalTicket);

  const hasCandidates = decision.kind === "synthesize";
  const answer = hasCandidates
    ? generalTicket
      ? "資料からは答えが見つかりませんでした。よければ「一般的な回答を見る」から、参考情報を確認できます。"
      : "近そうな資料は見つかりました。知りたいことを、もう少し詳しく聞かせてもらえますか？"
    : "その質問については、資料から確認できませんでした。よければ、運営スタッフに聞くこともできます。";
  return NextResponse.json({
    answer,
    source: hasCandidates ? "Markdown回答候補" : undefined,
    kind: "fallback",
    offerEscalation: hasCandidates ? undefined : true,
    generalTicket,
  });
}
