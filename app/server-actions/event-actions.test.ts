import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  db: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/server/action-context", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createEvent, updateEvent } from "./event-actions";

describe("admin event Server Action authorization", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.db.mockReset();
    mocks.redirect.mockClear();
    mocks.revalidatePath.mockReset();
  });

  it("stops a member request at the authorization boundary before validation or database access", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("FORBIDDEN_MEMBER"));

    await expect(createEvent(new FormData())).rejects.toThrow("FORBIDDEN_MEMBER");
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("updates event metadata through the transactional RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "updated", error: null });
    mocks.requireAdmin.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" });
    mocks.db.mockReturnValue({ rpc });

    const formData = new FormData();
    formData.set("event_id", "00000000-0000-4000-8000-000000000002");
    formData.set("title", "テストイベント");
    formData.set("starts_at", "2030-01-02T10:00");
    formData.set("ends_at", "2030-01-02T12:00");
    formData.set("location", "テストコート");
    formData.set("capacity", "12");
    formData.set("description", "説明");
    formData.set("event_type", "tennis");

    await expect(updateEvent(formData)).rejects.toThrow("REDIRECT:/admin/events?updated=1");
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("update_event_metadata", {
      p_actor: "00000000-0000-4000-8000-000000000001",
      p_event_id: "00000000-0000-4000-8000-000000000002",
      p_title: "テストイベント",
      p_starts_at: "2030-01-02T01:00:00.000Z",
      p_ends_at: "2030-01-02T03:00:00.000Z",
      p_location: "テストコート",
      p_capacity: 12,
      p_description: "説明",
      p_event_type: "tennis",
    });
  });
});
