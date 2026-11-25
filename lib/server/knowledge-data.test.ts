import { afterEach, beforeEach, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: () => ({ rpc }) }));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-25T00:00:00Z"));
  rpc.mockReset();
});

afterEach(() => vi.useRealTimers());

it("新RPCの適用待ちでも最長1分だけ同じ参照元の従来検索を使う", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } })
    .mockResolvedValue({ data: [], error: null });
  const { readKnowledge } = await import("./knowledge-data");

  await readKnowledge(["member.md"], "入会費");
  await readKnowledge(["member.md"], "練習頻度");
  expect(rpc.mock.calls.map(([procedure]) => procedure)).toEqual([
    "search_chatbot_candidates", "search_chatbot_knowledge", "search_chatbot_knowledge",
  ]);
  expect(rpc.mock.calls[1][1]).toEqual(rpc.mock.calls[0][1]);

  vi.advanceTimersByTime(60_000);
  await readKnowledge(["member.md"], "練習頻度");
  expect(rpc).toHaveBeenLastCalledWith("search_chatbot_candidates", expect.objectContaining({
    p_sources: ["member.md"],
  }));
});

it("設定不足以外の検索エラーでは検索方式を切り替えない", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
  const { readKnowledge } = await import("./knowledge-data");
  await expect(readKnowledge(["member.md"], "入会費")).rejects.toThrow("回答資料を取得できませんでした。");
  expect(rpc).toHaveBeenCalledTimes(1);
});
