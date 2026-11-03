import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  MARKDOWN_MAX_RECORDS,
  parseMarkdownKnowledge,
  validateMarkdownFiles,
} from "@/lib/markdown-knowledge";

export async function documentActor(request: Request, mutation = true) {
  if (mutation) {
    // Next's internal request URL can use localhost while the browser uses the
    // deployment host. Host is the actual HTTP destination, not a client-supplied
    // x-forwarded-host override. Missing/malformed Origin remains forbidden.
    try {
      const destination = new URL(request.url);
      const host = request.headers.get("host");
      if (host) destination.host = host;
      if (request.headers.get("origin") !== destination.origin) return null;
    } catch {
      return null;
    }
  }
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await db().from("users").select("role").eq("id", session.id).single();
  return !error && data?.role === "super_admin" ? session : null;
}

export async function documentFiles(request: Request) {
  if (Number(request.headers.get("content-length")) > 1_100_000)
    throw new Error("合計1MBまでです。");
  const form = await request.formData();
  const files = form.getAll("files");
  if (!files.every((file) => file instanceof File)) throw new Error("ファイルを確認してください。");
  const invalid = validateMarkdownFiles(files);
  if (invalid) throw new Error(invalid);
  return { files, form };
}

export async function parseDocument(file: File) {
  const markdown = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  const drafts = parseMarkdownKnowledge(markdown, file.name.replace(/\.md$/i, ""));
  if (!drafts.length) throw new Error("回答データがありません。");
  if (drafts.length > MARKDOWN_MAX_RECORDS)
    throw new Error(
      `1000件の上限を超えています。このファイルには${drafts.length.toLocaleString()}件あります。`,
    );
  return { markdown, drafts, hash: createHash("sha256").update(markdown).digest("hex") };
}

export function summarizeChanges(before: string, after: string) {
  const oldLines = before.replace(/\r\n?/g, "\n").split("\n");
  const newLines = after.replace(/\r\n?/g, "\n").split("\n");
  const counts = (lines: string[]) => {
    const result = new Map<string, number>();
    for (const line of lines) result.set(line, (result.get(line) ?? 0) + 1);
    return result;
  };
  const diff = (left: string[], right: string[]) => {
    const remaining = counts(right);
    return left.filter((line) => {
      const count = remaining.get(line) ?? 0;
      if (count) {
        remaining.set(line, count - 1);
        return false;
      }
      return true;
    });
  };
  const removed = diff(oldLines, newLines),
    added = diff(newLines, oldLines);
  return {
    removed: removed.slice(0, 100),
    added: added.slice(0, 100),
    removedCount: removed.length,
    addedCount: added.length,
    reordered: removed.length === 0 && added.length === 0 && before !== after,
  };
}
