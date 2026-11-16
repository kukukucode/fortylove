import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { documentActor } from "@/lib/server/chatbot-documents";

export async function GET(request: Request) {
  if (!(await documentActor(request, false)))
    return NextResponse.json({ error: "許可されていません。" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const versionId = params.get("version");
  const client = db();
  if (versionId) {
    if (!z.uuid().safeParse(versionId).success)
      return NextResponse.json({ error: "版が不正です。" }, { status: 400 });
    const { data, error } = await client
      .from("chatbot_document_versions")
      .select("markdown")
      .eq("id", versionId)
      .single();
    if (error || !data)
      return NextResponse.json({ error: "原本が見つかりません。" }, { status: 404 });
    return new Response(data.markdown, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": "attachment; filename=knowledge.md",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const source = params.get("source");
  if (!source || source.length > 255)
    return NextResponse.json({ error: "資料を選んでください。" }, { status: 400 });
  const { data: document, error } = await client
    .from("chatbot_documents")
    .select("id,active_version")
    .eq("source_name", source)
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "原本管理のマイグレーションを確認してください。" },
      { status: 503 },
    );
  if (!document)
    return NextResponse.json(
      { versions: [], activeVersion: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .max(100000)
    .safeParse(params.get("offset") ?? 0);
  if (!offset.success) return NextResponse.json({ error: "ページが不正です。" }, { status: 400 });
  const { data: versions, error: versionsError } = await client
    .from("chatbot_document_versions")
    .select("id,version,source_hash,embedding_model,created_at,created_by")
    .eq("document_id", document.id)
    .order("version", { ascending: false })
    .range(offset.data, offset.data + 19);
  if (versionsError)
    return NextResponse.json({ error: "履歴を取得できませんでした。" }, { status: 503 });
  return NextResponse.json(
    { versions, activeVersion: document.active_version },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const actor = await documentActor(request);
  if (!actor) return NextResponse.json({ error: "許可されていません。" }, { status: 403 });
  const input = z
    .object({ versionId: z.uuid(), expectedVersion: z.number().int().min(0) })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "版を確認してください。" }, { status: 400 });
  const { data, error } = await db().rpc("restore_chatbot_document", {
    p_actor: actor.id,
    p_version_id: input.data.versionId,
    p_expected_version: input.data.expectedVersion,
  });
  if (error)
    return NextResponse.json(
      {
        error: "復元できませんでした。履歴を再読み込みしてください。現在の資料は維持されています。",
      },
      { status: 409 },
    );
  return NextResponse.json({ version: data });
}
