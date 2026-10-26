import { apiOk, parseBody } from "@/lib/api/http";
import { getRuntime } from "@/lib/runtime";
import { settingsPatchSchema } from "@/lib/settings/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Updates non-secret session settings. Provider keys are never accepted here. */
export async function PATCH(request: Request) {
  const body = await parseBody(request, settingsPatchSchema);
  if (!body.ok) return body.response;
  const settings = getRuntime().updateSettings(body.data);
  return apiOk({ ok: true, settings });
}
