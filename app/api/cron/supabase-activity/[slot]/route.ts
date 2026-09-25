import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const slots = new Set(["early", "midday", "late"]);
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  }

  const slot = new URL(request.url).pathname.split("/").at(-1);
  if (!slot || !slots.has(slot)) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  }

  try {
    const { data, error } = await db()
      .from("app_settings")
      .select("id")
      .eq("id", 1)
      .abortSignal(AbortSignal.timeout(4000));

    if (!error && data?.length === 1) {
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
  } catch {
    // Keep connection and configuration details out of the public response.
  }

  return NextResponse.json({ error: "Database unavailable" }, { status: 503, headers: noStore });
}
