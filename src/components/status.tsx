"use client";

import { Badge } from "./ui";
import type { SessionSnapshot } from "@/lib/runtime-types";
import type { ConnectionStatus } from "@/lib/types";

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  error: "Error",
};

const CONNECTION_TONES: Record<ConnectionStatus, "neutral" | "ok" | "warn" | "bad" | "info"> = {
  disconnected: "neutral",
  connecting: "info",
  connected: "ok",
  reconnecting: "warn",
  error: "bad",
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  return (
    <Badge tone={CONNECTION_TONES[status]} dot>
      {CONNECTION_LABELS[status]}
    </Badge>
  );
}

/** Shows which data source is active. Live and demo data are never presented as the same thing. */
export function SourceBadge({ snapshot }: { snapshot: SessionSnapshot | null }) {
  if (!snapshot || snapshot.source === "none") {
    return <Badge tone="neutral">No data source</Badge>;
  }
  if (snapshot.source === "demo") {
    const label = { running: "Running", paused: "Paused", finished: "Finished", stopped: "Stopped" }[snapshot.demo.status];
    return <Badge tone="demo">Demo · synthetic · {label}</Badge>;
  }
  return <Badge tone="live" dot>Live · #{snapshot.channel}</Badge>;
}

export function AnalysisModeBadge({ snapshot }: { snapshot: SessionSnapshot | null }) {
  if (!snapshot) return null;
  if (snapshot.analysis.mode === "ai") {
    return <Badge tone="accent">AI · {snapshot.integrations.aiModel}</Badge>;
  }
  return <Badge tone="neutral">Local rules (not AI)</Badge>;
}
