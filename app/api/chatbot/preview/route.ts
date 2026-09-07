import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canUseChatbot, chatbotSourcesForAudience, type ChatbotRole } from "@/lib/chatbot-access";
import { allowsGeneralAnswer, decideKnowledgeResponse, isEventQuestion, type ChatbotKnowledge } from "@/lib/chatbot";
import { generateGroundedAnswer } from "@/lib/gemini-chatbot";

import { readKnowledge } from "@/lib/server/knowledge-data";
import { answerEvents } from "@/lib/server/chatbot-events";
import { embedTexts } from "@/lib/embeddings";
import { issueGeneralTicket, verifyGeneralTicket } from "@/lib/server/general-answer-ticket";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(500),
  audience: z.enum(["admin", "member"]).optional(),
  generalTicket: z.string().max(5000).optional(),
  choiceId: z.string().uuid().optional(),
});

function choiceResponse(records: ChatbotKnowledge[]) {
  const choices = records.slice(0, 3);
  return NextResponse.json({
    answer: "質問に近い内容が複数あります。知りたいものを選んでください。",
    source: "Markdown回答候補",
    kind: "choices",
    choices: choices.map((record, index) => ({ id: record.id, label: String(index + 1), title: record.title })),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  const client = db();

  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "質問は500文字以内で入力してください。" }, { status: 400 });

  const role = session.role as ChatbotRole;
  const { data: settings } = await client.from("app_settings").select("chatbot_admin_enabled,chatbot_member_enabled,chatbot_admin_sources,chatbot_member_sources,chatbot_fallback_message").eq("id", 1).maybeSingle();
  if (!canUseChatbot(role, settings)) return NextResponse.json({ error: "チャットBotの利用は許可されていません。" }, { status: 403 });
  const audience = role === "super_admin" ? input.data.audience ?? "member" : role === "admin" ? "admin" : "member";
  const sourceNames = chatbotSourcesForAudience(audience, settings);
  if (input.data.generalTicket && (!allowsGeneralAnswer(input.data.message) || !verifyGeneralTicket(input.data.generalTicket, session.id, audience, input.data.message))) {
    return NextResponse.json({ error: "この質問の一般回答は利用できません。もう一度質問してください。" }, { status: 400 });
  }
  if (role !== "super_admin") {
    const usageDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const { data: consumed, error: usageError } = await client.rpc("consume_chatbot_message", { p_user_id: session.id, p_usage_date: usageDate });
    if (usageError) return NextResponse.json({ error: "利用回数を確認できませんでした。時間をおいてお試しください。" }, { status: 503 });
    if (!consumed) return NextResponse.json({ answer: "本日のチャット利用上限（10件）に達しました。", source: "1日10件まで", kind: "daily-limit", offerEscalation: true }, { status: 429 });
  }

  if (input.data.generalTicket) {
    const answer = await generateGroundedAnswer(input.data.message, [], { general: true, audience });
    return NextResponse.json({ answer: answer ? `Fortyloveの公式回答ではありません。一般的な参考情報です。\n\n${answer}` : "一般的な回答を取得できませんでした。運営スタッフにご相談ください。", kind: "general", offerEscalation: !answer });
  }
  if (!input.data.choiceId && isEventQuestion(input.data.message)) {
    try { return NextResponse.json({ answer: await answerEvents(input.data.message), kind: "event" }); }
    catch { return NextResponse.json({ error: "開催情報を確認できませんでした。時間をおいてお試しください。" }, { status: 503 }); }
  }
  let knowledge: ChatbotKnowledge[];
  try { knowledge = await readKnowledge(sourceNames); }
  catch { return NextResponse.json({ error: "回答資料を確認できませんでした。時間をおいてお試しください。" }, { status: 503 }); }

  if (input.data.choiceId) {
    const selected = knowledge.find((record) => record.id === input.data.choiceId);
    if (!selected) return NextResponse.json({ error: "選択肢を確認できませんでした。もう一度質問してください。" }, { status: 400 });
    return NextResponse.json({ answer: selected.content, source: `Bot回答データ：${selected.title}`, kind: "knowledge" });
  }

  let decision = decideKnowledgeResponse(input.data.message, knowledge);
  if (decision.kind !== "direct") {
    try {
      // Interactive chat must not inherit the long retry policy used by bulk imports.
      // If Gemini is busy, keyword retrieval remains available immediately.
      const [vector] = await embedTexts([input.data.message], true, undefined, undefined, {
        maxAttempts: 1,
        requestTimeoutMs: 4_000,
      });
      const { data, error } = await client.rpc("chatbot_semantic_matches", { p_sources: sourceNames, p_query: vector });
      if (!error && data) decision = decideKnowledgeResponse(input.data.message, knowledge, Object.fromEntries(data.map((item: { id: string; similarity: number }) => [item.id, item.similarity])));
    } catch { /* Keyword retrieval remains available when the embedding service is unavailable. */ }
  }
  if (decision.kind === "direct") {
    return NextResponse.json({ answer: decision.record.content, source: `Bot回答データ：${decision.record.title}`, kind: "knowledge" });
  }
  if (decision.kind === "choices") return choiceResponse(decision.records);
  if (decision.kind === "synthesize") {
    const synthesized = await generateGroundedAnswer(input.data.message, decision.records, { audience });
    if (synthesized) {
      return NextResponse.json({ answer: synthesized, source: "Gemini・関連Markdown", kind: "gemini" });
    }
    if (decision.records.length > 1) return choiceResponse(decision.records);
    return NextResponse.json({
      answer: "関連しそうな資料はありますが、質問を特定できませんでした。知りたい内容をもう少し具体的に入力してください。",
      source: "Markdown回答候補",
      kind: "fallback",
    });
  }

  return NextResponse.json({
    answer: "資料には記載がありません。必要であれば運営スタッフへ確認できます。",
    kind: "fallback",
    offerEscalation: true,
    ...(allowsGeneralAnswer(input.data.message) ? { generalTicket: issueGeneralTicket(session.id, audience, input.data.message) } : {}),
  });
}
