import { apiError, apiOk } from "@/lib/api/http";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const outcome = await getRuntime().runAnalysis({ manual: true });
  switch (outcome.status) {
    case "ran":
      return apiOk({ ok: true, analysisId: outcome.analysis.id, mode: outcome.analysis.mode, aiError: outcome.analysis.aiError });
    case "busy":
      return apiError(409, "analysis_busy", "An analysis is already running. Its results will appear shortly.");
    case "cooldown":
      return apiError(429, "analysis_cooldown", `Analysis was run a moment ago. Try again in ${Math.ceil(outcome.retryInMs / 1000)} seconds.`);
    case "no_messages":
      return apiError(409, "no_messages", "There are no messages to analyse yet. Connect to a channel or start the demo first.");
    case "failed":
      return apiError(500, "analysis_failed", outcome.message);
  }
}
