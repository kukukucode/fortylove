import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/db", () => ({
  db: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }) }),
}));
import { documentActor, parseDocument, summarizeChanges } from "./chatbot-documents";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ id: "owner", role: "super_admin" });
});
it("Cookieのroleだけを信用せず現在のDB権限を検証する", async () => {
  mocks.single.mockResolvedValue({ data: { role: "admin" } });
  expect(
    await documentActor(
      new Request("http://localhost/test", { headers: { origin: "http://localhost" } }),
    ),
  ).toBeNull();
  mocks.single.mockResolvedValue({ data: { role: "super_admin" } });
  expect(
    await documentActor(
      new Request("http://localhost/test", { headers: { origin: "http://other" } }),
    ),
  ).toBeNull();
  expect(
    await documentActor(
      new Request("http://localhost/test", { headers: { origin: "http://localhost" } }),
    ),
  ).toEqual({ id: "owner", role: "super_admin" });
  expect(
    await documentActor(
      new Request("http://localhost:3011/test", {
        headers: { origin: "http://127.0.0.1:3011", host: "127.0.0.1:3011" },
      }),
    ),
  ).toEqual({ id: "owner", role: "super_admin" });
  expect(
    await documentActor(
      new Request("http://localhost/test", {
        headers: { origin: "http://evil.test", host: "localhost", "x-forwarded-host": "evil.test" },
      }),
    ),
  ).toBeNull();
});
it("差分は重複行も計数し並べ替えを知らせる", () => {
  expect(summarizeChanges("a\na\nb", "a\nb\nc")).toMatchObject({ added: ["c"], removed: ["a"] });
  expect(summarizeChanges("a\nb", "b\na").reordered).toBe(true);
});
it("正式な解析はサーバーで件数と原本ハッシュを確定する", async () => {
  const result = await parseDocument(new File(["## 会費\n3000円です。"], "会費.md"));
  expect(result.drafts).toHaveLength(1);
  expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(result.markdown).toBe("## 会費\n3000円です。");
});
