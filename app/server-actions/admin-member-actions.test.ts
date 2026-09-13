import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  requireAdmin: vi.fn(),
  db: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));

vi.mock("@/lib/server/action-context", () => ({
  requireAdmin: mocks.requireAdmin,
  requireSuperAdmin: mocks.requireSuperAdmin,
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { updateUserRole, updateUsersRole } from "./admin-member-actions";

describe("admin role Server Actions", () => {
  beforeEach(() => {
    mocks.requireSuperAdmin.mockReset();
    mocks.requireAdmin.mockReset();
    mocks.db.mockReset();
    mocks.redirect.mockClear();
    mocks.requireSuperAdmin.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" });
  });

  it("uses the audited atomic RPC for a single role change", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.db.mockReturnValue({ rpc });
    const formData = new FormData();
    formData.set("user_id", "00000000-0000-4000-8000-000000000002");
    formData.set("role", "admin");

    await expect(updateUserRole(formData)).rejects.toThrow("REDIRECT:/admin/admins?role_updated=1");
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("set_user_role_atomic", {
      p_actor: "00000000-0000-4000-8000-000000000001",
      p_user_id: "00000000-0000-4000-8000-000000000002",
      p_role: "admin",
    });
  });

  it("sends a bulk role change in one database call", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    mocks.db.mockReturnValue({ rpc });
    const formData = new FormData();
    formData.append("user_ids", "00000000-0000-4000-8000-000000000002");
    formData.append("user_ids", "00000000-0000-4000-8000-000000000003");
    formData.set("role", "super_admin");

    await expect(updateUsersRole(formData)).rejects.toThrow("REDIRECT:/admin/admins?role_updated=2");
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("set_members_role_atomic", {
      p_actor: "00000000-0000-4000-8000-000000000001",
      p_user_ids: [
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000003",
      ],
      p_role: "super_admin",
    });
  });
});
