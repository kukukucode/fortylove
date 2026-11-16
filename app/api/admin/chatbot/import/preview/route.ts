import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  documentActor,
  documentFiles,
  parseDocument,
  summarizeChanges,
} from "@/lib/server/chatbot-documents";

export async function POST(request: Request) {
  if (!(await documentActor(request)))
    return NextResponse.json({ error: "許可されていません。" }, { status: 403 });
  let files: File[];
  try {
    ({ files } = await documentFiles(request));
  } catch {
    return NextResponse.json(
      { error: "1〜10個のMarkdown・合計1MB以内で選択してください。" },
      { status: 400 },
    );
  }
  const client = db();
  const entries = [];
  for (const file of files) {
    try {
      const parsed = await parseDocument(file);
      const { data: document, error } = await client
        .from("chatbot_documents")
        .select("id,active_version")
        .eq("source_name", file.name)
        .maybeSingle();
      if (error) throw new Error("原本管理のマイグレーションを確認してください。");
      let previous = "";
      if (document?.active_version) {
        const { data: version, error: versionError } = await client
          .from("chatbot_document_versions")
          .select("markdown")
          .eq("document_id", document.id)
          .eq("version", document.active_version)
          .single();
        if (versionError) throw new Error("現在の原本を確認できませんでした。");
        previous = version.markdown;
      }
      entries.push({
        name: file.name,
        count: parsed.drafts.length,
        hash: parsed.hash,
        expectedVersion: document?.active_version ?? 0,
        legacy: Boolean(document && !document.active_version),
        changes: summarizeChanges(previous, parsed.markdown),
      });
    } catch (error) {
      entries.push({
        name: file.name,
        error: error instanceof Error ? error.message : "解析できませんでした。",
      });
    }
  }
  return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
}
