// Shared domain types used by the server runtime, API routes and the UI.

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/** Where the messages currently in the session come from. */
export type DataSource = "none" | "live" | "demo";

export type DemoStatus = "stopped" | "running" | "paused" | "finished";

export type MessageKind = "question" | "suggestion" | "technical" | "reaction" | "other";

export interface ChatMessage {
  /** Monotonic sequence number assigned by the session store. */
  seq: number;
  /** Twitch message id when provided by the source, otherwise a local id. */
  id: string;
  source: "twitch" | "demo";
  channel: string;
  username: string;
  text: string;
  truncated: boolean;
  /** ISO timestamp taken from the source when available, otherwise the receive time. */
  timestamp: string;
  isBroadcaster: boolean;
  isModerator: boolean;
  isQuestion: boolean;
  kind: MessageKind;
  questionGroupId: string | null;
  /** Topic labels this message was matched to in the most recent analysis. */
  topicLabels: string[];
  /** True once the message has been part of an analysis batch. */
  includedInAnalysis: boolean;
}

export interface QuestionExample {
  seq: number;
  username: string;
  text: string;
  timestamp: string;
}

export interface QuestionGroup {
  id: string;
  canonical: string;
  count: number;
  uniqueAskers: number;
  /** Up to three representative messages, one per asker where possible. */
  examples: QuestionExample[];
  firstSeenAt: string;
  latestAt: string;
  latestSeq: number;
  status: "open" | "handled";
  handledAt: string | null;
  /** True when a broadcaster message with overlapping wording appeared after the question. */
  responseDetected: boolean;
  /** Content tokens used for similarity and response matching. */
  tokens: string[];
}

export interface TopicCluster {
  label: string;
  explanation: string;
  /** Exact count for local analysis; model-referenced count for AI analysis. */
  messageCount: number;
  latestAt: string;
  sampleSeqs: number[];
  source: "local" | "ai";
}

export interface SentimentOverview {
  positive: number;
  neutral: number;
  negative: number;
  ambiguous: number;
  total: number;
}

export interface Suggestion {
  id: string;
  text: string;
  basis: string;
}

export type AnalysisMode = "local" | "ai";

export interface AnalysisResult {
  id: string;
  createdAt: string;
  mode: AnalysisMode;
  engineLabel: string;
  batchSize: number;
  firstSeq: number;
  lastSeq: number;
  summary: string;
  topics: TopicCluster[];
  sentiment: SentimentOverview;
  messageKinds: Record<MessageKind, number>;
  suggestions: Suggestion[];
  /** Set when AI analysis was requested but failed and local rules were used instead. */
  aiError: string | null;
}

export interface SessionSettings {
  bufferSize: number;
  analysisIntervalSec: number;
  autoAnalysis: boolean;
  useAi: boolean;
}

export interface ConnectionSnapshot {
  status: ConnectionStatus;
  channel: string | null;
  error: string | null;
  since: string | null;
  attempt: number;
  nextRetryAt: string | null;
}
