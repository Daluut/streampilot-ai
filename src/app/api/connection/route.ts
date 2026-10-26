import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/lib/api/http";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), channel: z.string().max(100) }),
  z.object({ action: z.literal("disconnect") }),
]);

export async function POST(request: Request) {
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;

  const session = getRuntime();
  if (body.data.action === "disconnect") {
    session.disconnectLive();
    return apiOk({ ok: true });
  }

  const result = session.connectLive(body.data);
  if (!result.ok) return apiError(400, "invalid_channel", result.error);
  return apiOk({ ok: true, channel: result.channel }, 202);
}
