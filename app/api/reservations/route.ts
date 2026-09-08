import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { uuidSchema } from "@/lib/input-validation";

type ReservationOperation = "reserve" | "cancel";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    if (origin && new URL(origin).host !== request.headers.get("host")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }

  const user = await getSession();
  if (!user || !["member", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { eventId?: unknown; operation?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "reservation" }, { status: 400 }); }
  const eventId = uuidSchema.safeParse(body.eventId);
  const operation = body.operation as ReservationOperation;
  if (!eventId.success || !["reserve", "cancel"].includes(operation)) {
    return NextResponse.json({ error: "reservation" }, { status: 400 });
  }

  const result = operation === "reserve"
    ? await db().rpc("reserve_event", { p_user_id: user.id, p_event_id: eventId.data })
    : await db().rpc("cancel_event_reservation", { p_user_id: user.id, p_event_id: eventId.data });
  if (result.error) return NextResponse.json({ error: "reservation" }, { status: 500 });
  if (operation === "reserve" && result.data === "full") return NextResponse.json({ error: "full" }, { status: 409 });
  if (operation === "cancel" && result.data === "deadline_passed") return NextResponse.json({ error: "cancel-deadline" }, { status: 409 });
  const accepted = operation === "reserve"
    ? ["reserved", "already_reserved"].includes(String(result.data))
    : result.data === "cancelled";
  if (!accepted) return NextResponse.json({ error: "reservation" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
