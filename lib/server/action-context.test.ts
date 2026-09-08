import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  single: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db", () => ({
  db: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: mocks.single }),
      }),
    }),
  }),
}));

import { requireAdmin, requireMember, requireParticipant, requireSession, requireSuperAdmin } from "./action-context";

const session = { id: "550e8400-e29b-41d4-a716-446655440000" };

describe("Server Action authorization boundary", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.single.mockReset();
    mocks.redirect.mockClear();
  });

  it("rejects unauthenticated requests before database access", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.single).not.toHaveBeenCalled();
  });

  it("returns an authenticated session without a database lookup", async () => {
    mocks.getSession.mockResolvedValue(session);
    await expect(requireSession()).resolves.toEqual(session);
    expect(mocks.single).not.toHaveBeenCalled();
  });

  it("rejects a member at the shared admin action boundary", async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.single.mockResolvedValue({ data: { ...session, name: "Member", role: "member" } });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");
  });

  it("allows admins but reserves super-admin actions for super admins", async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.single.mockResolvedValue({ data: { ...session, name: "Admin", role: "admin" } });
    await expect(requireAdmin()).resolves.toMatchObject({ role: "admin" });
    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT:/admin");

    mocks.single.mockResolvedValue({ data: { ...session, name: "Owner", role: "super_admin" } });
    await expect(requireSuperAdmin()).resolves.toMatchObject({ role: "super_admin" });
  });

  it("reserves profiles for members and event participation for members and super admins", async () => {
    mocks.getSession.mockResolvedValue({ ...session, role: "admin" });
    await expect(requireMember()).rejects.toThrow("REDIRECT:/admin");
    await expect(requireParticipant()).rejects.toThrow("REDIRECT:/admin");

    mocks.getSession.mockResolvedValue({ ...session, role: "member" });
    await expect(requireMember()).resolves.toMatchObject({ role: "member" });
    await expect(requireParticipant()).resolves.toMatchObject({ role: "member" });

    mocks.getSession.mockResolvedValue({ ...session, role: "super_admin" });
    await expect(requireMember()).rejects.toThrow("REDIRECT:/admin");
    await expect(requireParticipant()).resolves.toMatchObject({ role: "super_admin" });
  });
});
