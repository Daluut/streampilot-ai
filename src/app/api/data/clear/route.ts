import { z } from "zod";
import { apiOk, parseBody } from "@/lib/api/http";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Requiring an explicit confirmation flag stops accidental clears from stray requests.
const bodySchema = z.object({ confirm: z.literal(true) });

export async function POST(request: Request) {
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  getRuntime().clearSession();
  return apiOk({ ok: true });
}
