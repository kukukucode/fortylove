import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  limit: vi.fn(),
  gte: vi.fn(),
  lt: vi.fn(),
  eq: vi.fn(),
  ilike: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: () => ({ from: mocks.from }) }));
import { answerEvents } from "./chatbot-events";
beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    select: vi.fn(),
    gte: mocks.gte,
    lt: mocks.lt,
    eq: mocks.eq,
    ilike: mocks.ilike,
    order: vi.fn(),
    limit: mocks.limit,
  };
  for (const method of [query.select, query.gte, query.lt, query.eq, query.ilike, query.order])
    method.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.limit.mockResolvedValue({ data: [] });
});
it("指定日と種類はDBの絞り込み条件へ渡し、該当なしを別予定で埋めない", async () => {
  const answer = await answerEvents("2027年2月5日の練習はどこ");
  expect(mocks.gte).toHaveBeenCalledWith("starts_at", "2027-02-04T15:00:00.000Z");
  expect(mocks.lt).toHaveBeenCalledWith("starts_at", "2027-02-05T15:00:00.000Z");
  expect(mocks.eq).toHaveBeenCalledWith("event_type", "tennis");
  expect(mocks.limit).toHaveBeenCalledWith(11);
  expect(answer).toContain("指定した条件に合う開催予定は現在登録されていません");
});
it("指定タイトルのSQLワイルドカードはエスケープする", async () => {
  await answerEvents("「100%歓迎_練習」の場所");
  expect(mocks.ilike).toHaveBeenCalledWith("title", "%100\\%歓迎\\_練習%");
});
it("複数の開催予定から勝手に一件を確定しない", async () => {
  mocks.limit.mockResolvedValue({ data: [{ title: "A練習" }, { title: "B練習" }] });
  expect(await answerEvents("練習の場所はどこ")).toContain("候補が複数");
});
