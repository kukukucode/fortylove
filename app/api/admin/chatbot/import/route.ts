import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { EMBEDDING_MODEL, embedTexts } from "@/lib/embeddings";
import { documentActor, documentFiles, parseDocument } from "@/lib/server/chatbot-documents";

export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await documentActor(request);
  if (!session) return NextResponse.json({ error: "許可されていません。" }, { status: 403 });
  const client = db();
  let payload: Awaited<ReturnType<typeof documentFiles>>;
  try {
    payload = await documentFiles(request);
  } catch {
    return NextResponse.json(
      { error: "ファイルを確認してください。合計1MBまでです。" },
      { status: 400 },
    );
  }
  const { files, form } = payload;
  let rawReviews: unknown;
  try {
    rawReviews = JSON.parse(String(form.get("reviews") ?? "null"));
  } catch {
    rawReviews = null;
  }
  const reviews = z
    .array(
      z.object({
        name: z.string().max(255),
        hash: z.string().regex(/^[0-9a-f]{64}$/),
        expectedVersion: z.number().int().min(0),
      }),
    )
    .max(10)
    .safeParse(rawReviews);
  if (
    !reviews.success ||
    files.some((file) => !reviews.data.some((review) => review.name === file.name))
  )
    return NextResponse.json({ error: "先に変更内容を確認してください。" }, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let connected = true;
      const report = (value: object) => {
        if (connected) {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
          } catch {
            connected = false;
          }
        }
      };
      for (const file of files as File[]) {
        if (!connected) break;
        try {
          report({ name: file.name, state: "解析中" });
          const { markdown, drafts, hash } = await parseDocument(file);
          const review = reviews.data.find((item) => item.name === file.name)!;
          if (review.hash !== hash)
            throw new Error("内容が変わりました。変更内容をもう一度確認してください。");
          report({ name: file.name, state: "検索データ生成中", count: drafts.length });
          const embeddings = await embedTexts(
            drafts.map((draft) => `${draft.title}\n${draft.content}`),
            false,
            (done) =>
              report({
                name: file.name,
                state: `検索データ生成中 ${done}/${drafts.length}`,
                count: drafts.length,
              }),
            ({ completed, delayMs, reason }) =>
              report({
                name: file.name,
                state: `${reason === "rate_limit" ? "利用枠の回復" : "API再接続"}を待機中 ${completed}/${drafts.length}（約${Math.max(1, Math.ceil(delayMs / 1000))}秒）`,
                count: drafts.length,
              }),
          );
          if (!connected) break;
          report({ name: file.name, state: "アップロード中" });
          const { error } = await client.rpc("publish_chatbot_document", {
            p_actor: session.id,
            p_name: file.name,
            p_hash: hash,
            p_markdown: markdown,
            p_model: EMBEDDING_MODEL,
            p_expected_version: review.expectedVersion,
            p_rows: drafts.map((draft, index) => ({
              ...draft,
              source_section: draft.sourceSection,
              embedding: embeddings[index],
            })),
          });
          if (error)
            throw new Error(
              "保存できませんでした。再選択して現在の版を確認してください。マイグレーション・接続もご確認ください。旧データは維持されています。",
            );
          report({ name: file.name, state: "完了", count: drafts.length });
        } catch (error) {
          report({
            name: file.name,
            state: "エラー",
            error: error instanceof Error ? error.message : "取り込みに失敗しました。",
          });
        }
      }
      try {
        controller.close();
      } catch {
        /* Client disconnected; committed files remain valid. */
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
