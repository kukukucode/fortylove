import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ abort: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: () => {
    mocks.db();
    return { from: () => ({ select: () => ({ eq: () => ({ abortSignal: mocks.abort }) }) }) };
  },
}));

import { GET } from "./route";

const request = (slot = "early", token?: string) =>
  new Request(`https://example.com/api/cron/supabase-activity/${slot}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-test-secret");
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

it("does not query the database without a valid Cron secret", async () => {
  expect((await GET(request())).status).toBe(401);
  expect((await GET(request("early", "wrong"))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(request("early", "cron-test-secret"))).status).toBe(401);
  expect(mocks.db).not.toHaveBeenCalled();
});

it("accepts only configured slots and reads the database without caching", async () => {
  expect((await GET(request("other", "cron-test-secret"))).status).toBe(404);
  expect(mocks.db).not.toHaveBeenCalled();
  mocks.abort.mockResolvedValue({ data: [{ id: 1 }], error: null });
  for (const slot of ["early", "midday", "late"]) {
    const response = await GET(request(slot, "cron-test-secret"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
  }
  expect(mocks.abort).toHaveBeenCalledTimes(3);
  expect(mocks.abort.mock.lastCall?.[0]).toBeInstanceOf(AbortSignal);
});

it("reports database failures without exposing details", async () => {
  mocks.abort.mockResolvedValueOnce({ data: [], error: null });
  expect((await GET(request("early", "cron-test-secret"))).status).toBe(503);
  mocks.abort.mockRejectedValueOnce(new Error("private database hostname"));
  const response = await GET(request("early", "cron-test-secret"));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private database hostname");
});
