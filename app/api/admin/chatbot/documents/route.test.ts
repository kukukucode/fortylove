import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), rpc: vi.fn(), single: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/server/chatbot-documents", () => ({ documentActor: mocks.actor }));
vi.mock("@/lib/db", () => ({ db: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
import { GET, POST } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: "owner" });
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ single: mocks.single }) }) });
});
it("原本の取得・復元は認可を通らない利用者に許可しない", async () => {
  mocks.actor.mockResolvedValue(null);
  expect(
    (await GET(new Request("http://localhost/api/admin/chatbot/documents?source=private.md")))
      .status,
  ).toBe(403);
  expect(
    (
      await POST(
        new Request("http://localhost/api/admin/chatbot/documents", { method: "POST", body: "{}" }),
      )
    ).status,
  ).toBe(403);
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("原本はHTMLとして表示せずキャッシュしない", async () => {
  mocks.single.mockResolvedValue({ data: { markdown: "<script>private</script>" } });
  const response = await GET(
    new Request(
      "http://localhost/api/admin/chatbot/documents?version=11111111-1111-4111-8111-111111111111",
    ),
  );
  expect(response.headers.get("content-type")).toContain("text/plain");
  expect(response.headers.get("content-disposition")).toContain("attachment");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("競合時の復元失敗を成功と表示しない", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "Document changed" } });
  const response = await POST(
    new Request("http://localhost/api/admin/chatbot/documents", {
      method: "POST",
      body: JSON.stringify({
        versionId: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 2,
      }),
    }),
  );
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("維持");
});
