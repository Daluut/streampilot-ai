// Types describing the snapshot served by /api/session. Kept free of server imports so the
// browser bundle can use them safely.

import type { SETTING_LIMITS } from "@/lib/settings/schema";
import type { SessionMetrics } from "@/lib/state/session-store";
import type { AnalysisResult, ChatMessage, ConnectionSnapshot, DataSource, DemoStatus, QuestionGroup, SessionSettings } from "@/lib/types";

export interface SessionSnapshot {
  epoch: number;
  serverTime: string;
  source: DataSource;
  channel: string | null;
  connection: ConnectionSnapshot;
  demo: { status: DemoStatus; emitted: number; total: number; channel: string };
  settings: SessionSettings;
  settingsLimits: typeof SETTING_LIMITS;
  integrations: {
    twitchAuthMode: "anonymous" | "token";
    twitchIrcUrl: string;
    aiConfigured: boolean;
    aiModel: string | null;
    aiEnabled: boolean;
    configError: string | null;
  };
  analysis: {
    inFlight: boolean;
    lastAt: string | null;
    nextAt: string | null;
    error: string | null;
    mode: "local" | "ai";
    intervalSec: number;
  };
  metrics: SessionMetrics;
  questionGroups: Omit<QuestionGroup, "tokens">[];
  analyses: AnalysisResult[];
  messages: ChatMessage[];
  latestSeq: number;
}
