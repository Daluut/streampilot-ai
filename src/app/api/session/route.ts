import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns the session snapshot. Pass ?after=<seq> to receive only newer messages. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const afterParam = Number(url.searchParams.get("after") ?? "0");
  const after = Number.isInteger(afterParam) && afterParam >= 0 ? afterParam : 0;
  return NextResponse.json(getRuntime().snapshot(after), {
    headers: { "Cache-Control": "no-store" },
  });
}
