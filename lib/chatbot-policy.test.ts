import { afterEach, expect, it, vi } from "vitest";
import { allowsGeneralAnswer } from "./chatbot";
import { parseMarkdownKnowledge, validateMarkdownFiles } from "./markdown-knowledge";
import { issueGeneralTicket, verifyGeneralTicket } from "./server/general-answer-ticket";
import { embedTexts } from "./embeddings";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("1000件と1001件を切り捨てず計数する", () => {
  for (const count of [1000, 1001]) expect(parseMarkdownKnowledge(Array.from({ length: count }, (_, i) => `## 質問${i}\n回答です。`).join("\n"), "資料")).toHaveLength(count);
});
it("10ファイル・合計1MBの境界と重複名を検証する", () => {
  const files = Array.from({ length: 10 }, (_, i) => ({ name: `${i}.md`, size: 100000 }));
  expect(validateMarkdownFiles(files)).toBeNull();
  expect(validateMarkdownFiles([...files, { name: "11.md", size: 1 }])).not.toBeNull();
  expect(validateMarkdownFiles([{ name: "a.md", size: 1000001 }])).not.toBeNull();
  expect(validateMarkdownFiles([files[0], files[0]])).not.toBeNull();
});
it("一般回答でクラブ固有の判断を受け付けない", () => {
  expect(allowsGeneralAnswer("ラケットの選び方を教えて")).toBe(true);
  for (const question of ["Fortyloveのラケットの選び方", "テニスの持ち物と参加費", "来月の会費", "入会できますか"]) expect(allowsGeneralAnswer(question)).toBe(false);
});
it("一般回答の同意券は本人・対象・質問・有効期限を検証する", () => {
  vi.stubEnv("SESSION_SECRET", "test-only-long-secret");
  const ticket = issueGeneralTicket("member-a", "member", "テニスのルール");
  expect(verifyGeneralTicket(ticket,"member-a","member","テニスのルール")).toBe(true);
  expect(verifyGeneralTicket(ticket,"member-b","member","テニスのルール")).toBe(false);
  expect(verifyGeneralTicket(ticket,"member-a","admin","テニスのルール")).toBe(false);
  expect(verifyGeneralTicket(ticket,"member-a","member","別の質問")).toBe(false);
  expect(verifyGeneralTicket(ticket+"x","member-a","member","テニスのルール")).toBe(false);
});
it("Embedding生成の部分失敗を成功として扱わない", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ embeddings: [{ values: [1, 2] }] }), { status: 200 })));
  await expect(embedTexts(["資料"])).rejects.toThrow();
});
it("133件のEmbeddingをAPI負荷を抑えた小さい単位で生成する", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test");
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { requests: unknown[] };
    return new Response(JSON.stringify({ embeddings: body.requests.map(() => ({ values: Array(768).fill(0.1) })) }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const progress: number[] = [];
  const vectors = await embedTexts(Array.from({ length: 133 }, (_, index) => `回答${index}`), false, (count) => progress.push(count));
  expect(vectors).toHaveLength(133);
  expect(fetchMock).toHaveBeenCalledTimes(7);
  expect(progress).toEqual([20, 40, 60, 80, 100, 120, 133]);
});
it("一時的な利用枠エラーは待機して再試行する", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test");
  const vector = Array(768).fill(0.1);
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }), { status: 429, headers: { "Retry-After": "0" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ embeddings: [{ values: vector }] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const retries: unknown[] = [];
  await expect(embedTexts(["資料"], false, undefined, (retry) => retries.push(retry))).resolves.toEqual([vector]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(retries).toEqual([{ completed: 0, delayMs: 0, reason: "rate_limit" }]);
});
it("API認証エラーを利用枠エラーと区別する", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: 403 })));
  await expect(embedTexts(["資料"])).rejects.toThrow("Gemini APIキー");
});
it("通常チャット向け設定では利用枠エラーを待たずに終了する", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test");
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }), { status: 429 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(embedTexts(["質問"], true, undefined, undefined, { maxAttempts: 1, requestTimeoutMs: 4_000 })).rejects.toThrow("利用枠");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
