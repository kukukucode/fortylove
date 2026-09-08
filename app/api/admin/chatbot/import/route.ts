import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { embedTexts } from "@/lib/embeddings";
import { MARKDOWN_MAX_RECORDS, parseMarkdownKnowledge, validateMarkdownFiles } from "@/lib/markdown-knowledge";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "許可されていません。" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
  const client = db();
  const { data: user } = await client.from("users").select("role").eq("id", session.id).single();
  if (user?.role !== "super_admin") return NextResponse.json({ error: "許可されていません。" }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 1_100_000) return NextResponse.json({ error: "合計1MBまでです。" }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const files = form?.getAll("files") ?? [];
  if (!files.every((file) => file instanceof File)) return NextResponse.json({ error: "ファイルを確認してください。" }, { status: 400 });
  const invalid = validateMarkdownFiles(files as File[]);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let connected = true;
      const report = (value: object) => { if (connected) { try { controller.enqueue(encoder.encode(JSON.stringify(value) + "\n")); } catch { connected = false; } } };
      for (const file of files as File[]) {
        if (!connected) break;
        try {
          report({ name: file.name, state: "解析中" });
          const markdown = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
          const drafts = parseMarkdownKnowledge(markdown, file.name.replace(/\.md$/i, ""));
          if (!drafts.length) throw new Error("回答データがありません。");
          if (drafts.length > MARKDOWN_MAX_RECORDS) throw new Error(`1000件の上限を超えています。このファイルには${drafts.length.toLocaleString()}件のデータがあります。`);
          report({ name: file.name, state: "検索データ生成中", count: drafts.length });
          const embeddings = await embedTexts(drafts.map((draft) => `${draft.title}\n${draft.content}`), false,
            (done) => report({ name: file.name, state: `検索データ生成中 ${done}/${drafts.length}`, count: drafts.length }),
            ({ completed, delayMs, reason }) => report({
              name: file.name,
              state: `${reason === "rate_limit" ? "利用枠の回復" : "API再接続"}を待機中 ${completed}/${drafts.length}（約${Math.max(1, Math.ceil(delayMs / 1000))}秒）`,
              count: drafts.length,
            }));
          if (!connected) break;
          report({ name: file.name, state: "アップロード中" });
          const { error } = await client.rpc("replace_chatbot_source", {
            p_actor: session.id, p_name: file.name,
            p_hash: createHash("sha256").update(markdown).digest("hex"),
            p_rows: drafts.map((draft, index) => ({ ...draft, source_section: draft.sourceSection, embedding: embeddings[index] })),
          });
          if (error) throw new Error("保存できませんでした。追加マイグレーションと接続をご確認ください。旧データは維持されています。");
          report({ name: file.name, state: "完了", count: drafts.length });
        } catch (error) {
          report({ name: file.name, state: "エラー", error: error instanceof Error ? error.message : "取り込みに失敗しました。" });
        }
      }
      try { controller.close(); } catch { /* Client disconnected; committed files remain valid. */ }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
