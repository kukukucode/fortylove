import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => ({ db: () => ({ rpc: mocks.rpc }) }));

import { POST } from "./route";

const eventId = "550e8400-e29b-41d4-a716-446655440000";
const request = () => new NextRequest("http://localhost/api/reservations", {
  method: "POST",
  headers: { host: "localhost", origin: "http://localhost" },
  body: JSON.stringify({ eventId, operation: "reserve" }),
});

describe("reservation role boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: "reserved", error: null });
  });

  it("allows members and super admins to participate", async () => {
    for (const role of ["member", "super_admin"]) {
      mocks.getSession.mockResolvedValue({ id: `${role}-id`, role });
      expect((await POST(request())).status).toBe(200);
    }
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("does not allow regular admins to reserve events", async () => {
    mocks.getSession.mockResolvedValue({ id: "admin-id", role: "admin" });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
