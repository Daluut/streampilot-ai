import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/lib/api/http";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ status: z.enum(["open", "handled"]) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^q-\d{1,6}$/.test(id)) return apiError(400, "invalid_id", "Unknown question id.");
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  const updated = getRuntime().setQuestionStatus(id, body.data.status);
  if (!updated) return apiError(404, "not_found", "That question is no longer in the queue.");
  return apiOk({ ok: true, status: body.data.status });
}
