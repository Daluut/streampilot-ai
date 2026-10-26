"use client";

import { useState } from "react";
import { Pause, Play, RotateCcw, FlaskConical } from "lucide-react";
import { Button, Card, CardHeader } from "./ui";
import { useSession } from "./session-provider";
import { DEMO_CHANNEL } from "@/lib/demo/script";

export function DemoPanel() {
  const { snapshot, demo } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  if (!snapshot) return null;

  const status = snapshot.demo.status;
  const run = async (action: "start" | "pause" | "resume" | "reset") => {
    setBusy(action);
    await demo(action);
    setBusy(null);
  };

  const description = {
    stopped: "Explore StreamPilot with a scripted boss-fight chat. No Twitch account or AI key is needed.",
    running: `Synthetic messages from the fictional channel "${DEMO_CHANNEL}" are arriving. This is not a real stream.`,
    paused: "Demo paused. Messages stop arriving but nothing already received is removed.",
    finished: "The scripted demo has finished. Reset to clear it, or start again to replay from the beginning.",
  }[status];

  return (
    <Card>
      <CardHeader
        title="Demo mode"
        description="Synthetic chat for trying the product offline."
        action={<span className="inline-flex items-center gap-1 rounded-md border border-demo/40 bg-demo/10 px-2 py-0.5 text-xs font-medium text-amber-300"><FlaskConical aria-hidden className="size-3.5" />Synthetic data</span>}
      />
      <div className="space-y-3 p-4">
        <p className="text-sm text-ink/90">{description}</p>
        {snapshot.demo.emitted > 0 ? (
          <p className="text-xs text-muted" aria-live="off">{snapshot.demo.emitted} of {snapshot.demo.total} scripted messages sent</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {status === "running" ? (
            <Button onClick={() => run("pause")} loading={busy === "pause"}><Pause aria-hidden className="size-4" />Pause demo</Button>
          ) : status === "paused" ? (
            <Button variant="primary" onClick={() => run("resume")} loading={busy === "resume"}><Play aria-hidden className="size-4" />Resume demo</Button>
          ) : (
            <Button variant="primary" onClick={() => run("start")} loading={busy === "start"}><Play aria-hidden className="size-4" />{status === "finished" ? "Replay demo" : "Try demo"}</Button>
          )}
          <Button variant="secondary" onClick={() => run("reset")} loading={busy === "reset"} disabled={status === "stopped" && snapshot.source !== "demo"}>
            <RotateCcw aria-hidden className="size-4" />
            Reset demo
          </Button>
        </div>
      </div>
    </Card>
  );
}
