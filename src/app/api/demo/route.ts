import { z } from "zod";
import { apiOk, parseBody } from "@/lib/api/http";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["start", "pause", "resume", "reset"]),
});

export async function POST(request: Request) {
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;

  const session = getRuntime();
  switch (body.data.action) {
    case "start":
      session.startDemo();
      break;
    case "pause":
      session.pauseDemo();
      break;
    case "resume":
      session.resumeDemo();
      break;
    case "reset":
      session.resetDemo();
      break;
  }
  return apiOk({ ok: true, demoStatus: session.store.demoStatus });
}
