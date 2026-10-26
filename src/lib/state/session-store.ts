// In-memory session state for the single StreamPilot process. Everything here is bounded:
// the message buffer, question groups, analysis history and duplicate-id memory all have caps.
// Nothing is written to disk, so a server restart clears the session.

import { sanitizeMessageText, contentTokens } from "@/lib/analysis/text";
import { isQuestion } from "@/lib/analysis/question-detector";
import { classifyKind } from "@/lib/analysis/message-kind";
import {
  addQuestionToGroups,
  markResponses,
} from "@/lib/analysis/question-groups";
import { DEFAULT_SETTINGS, SETTING_LIMITS } from "@/lib/settings/schema";
import type {
  AnalysisResult,
  ChatMessage,
  ConnectionSnapshot,
  DataSource,
  DemoStatus,
  QuestionGroup,
  SessionSettings,
} from "@/lib/types";

const MAX_SEEN_IDS = 5000;
const MAX_UNIQUE_CHATTERS = 50_000;
const MAX_ANALYSES = 20;

/** Question group without the internal matching tokens, safe to send to the browser. */
export function toPublicQuestionGroup(group: QuestionGroup): Omit<QuestionGroup, "tokens"> {
  const copy: Partial<QuestionGroup> = { ...group };
  delete copy.tokens;
  return copy as Omit<QuestionGroup, "tokens">;
}

export const IDLE_CONNECTION: ConnectionSnapshot = {
  status: "disconnected",
  channel: null,
  error: null,
  since: null,
  attempt: 0,
  nextRetryAt: null,
};

export interface IngestInput {
  id: string | null;
  source: "twitch" | "demo";
  channel: string;
  username: string;
  text: string;
  timestamp: string;
  isBroadcaster: boolean;
  isModerator: boolean;
}

export type IngestResult =
  | { accepted: true; message: ChatMessage }
  | { accepted: false; reason: "duplicate" | "empty" };

export interface SessionMetrics {
  messagesReceived: number;
  messagesInBuffer: number;
  duplicatesDropped: number;
  ignoredLines: number;
  uniqueChatters: number;
  questionGroups: number;
  repeatedQuestionGroups: number;
  openQuestionGroups: number;
  analysedMessages: number;
}

export class SessionStore {
  /** Increases whenever the session is cleared, so clients know to drop their copy. */
  epoch = 1;
  settings: SessionSettings = { ...DEFAULT_SETTINGS };
  connection: ConnectionSnapshot = { ...IDLE_CONNECTION };
  source: DataSource = "none";
  demoStatus: DemoStatus = "stopped";

  messages: ChatMessage[] = [];
  groups: QuestionGroup[] = [];
  analyses: AnalysisResult[] = [];

  lastAnalysisAt: string | null = null;
  lastAnalysisSeq = 0;
  analysisInFlight = false;
  lastAnalysisError: string | null = null;

  private seq = 0;
  private groupCounter = 0;
  private analysisCounter = 0;
  private seenIds = new Set<string>();
  private seenOrder: string[] = [];
  private uniqueChatters = new Set<string>();
  private counters = { received: 0, duplicatesDropped: 0, ignoredLines: 0 };

  /** Adds a normalised chat message. Duplicates by source id are dropped. */
  ingest(input: IngestInput): IngestResult {
    const { text, truncated } = sanitizeMessageText(input.text);
    if (text.length === 0) return { accepted: false, reason: "empty" };

    if (input.id) {
      if (this.seenIds.has(input.id)) {
        this.counters.duplicatesDropped += 1;
        return { accepted: false, reason: "duplicate" };
      }
      this.rememberId(input.id);
    }

    this.seq += 1;
    const question = isQuestion(text);
    const tokens = contentTokens(text);
    const message: ChatMessage = {
      seq: this.seq,
      id: input.id ?? `local-${this.seq}`,
      source: input.source,
      channel: input.channel,
      username: input.username,
      text,
      truncated,
      timestamp: input.timestamp,
      isBroadcaster: input.isBroadcaster,
      isModerator: input.isModerator,
      isQuestion: question,
      kind: classifyKind(text, question),
      questionGroupId: null,
      topicLabels: [],
      includedInAnalysis: false,
    };

    if (question) {
      const { group } = addQuestionToGroups(this.groups, {
        seq: message.seq,
        username: message.username,
        text,
        timestamp: message.timestamp,
        tokens,
      }, () => {
        this.groupCounter += 1;
        return `q-${this.groupCounter}`;
      });
      message.questionGroupId = group.id;
    } else if (input.isBroadcaster) {
      markResponses(this.groups, { seq: message.seq, tokens });
    }

    this.counters.received += 1;
    if (this.uniqueChatters.size < MAX_UNIQUE_CHATTERS) {
      this.uniqueChatters.add(input.username.toLowerCase());
    }

    this.messages.push(message);
    this.trimMessages();
    return { accepted: true, message };
  }

  recordIgnoredLine(): void {
    this.counters.ignoredLines += 1;
  }

  /** The most recent `size` messages, used as an analysis batch. */
  recentBatch(size: number): ChatMessage[] {
    return this.messages.slice(-size);
  }

  messagesAfter(seq: number): ChatMessage[] {
    if (seq <= 0) return this.messages.slice();
    // Messages are ordered by seq, so a reverse scan is cheap for typical polls.
    let index = this.messages.length;
    while (index > 0 && this.messages[index - 1].seq > seq) index -= 1;
    return this.messages.slice(index);
  }

  setQuestionStatus(groupId: string, status: "open" | "handled"): QuestionGroup | null {
    const group = this.groups.find((g) => g.id === groupId);
    if (!group) return null;
    group.status = status;
    group.handledAt = status === "handled" ? new Date().toISOString() : null;
    return group;
  }

  /** Stores an analysis result and tags the messages it covered. */
  applyAnalysis(result: AnalysisResult, topicLabelsBySeq: Map<number, string[]>): void {
    this.analysisCounter += 1;
    this.analyses.push(result);
    if (this.analyses.length > MAX_ANALYSES) this.analyses.splice(0, this.analyses.length - MAX_ANALYSES);

    for (const message of this.messages) {
      if (message.seq < result.firstSeq || message.seq > result.lastSeq) continue;
      message.includedInAnalysis = true;
      message.topicLabels = topicLabelsBySeq.get(message.seq) ?? [];
    }

    this.lastAnalysisAt = result.createdAt;
    this.lastAnalysisSeq = result.lastSeq;
    this.lastAnalysisError = result.aiError;
  }

  nextAnalysisId(): string {
    return `a-${this.analysisCounter + 1}`;
  }

  updateSettings(patch: Partial<SessionSettings>): SessionSettings {
    this.settings = {
      bufferSize: clamp(patch.bufferSize ?? this.settings.bufferSize, SETTING_LIMITS.bufferSize),
      analysisIntervalSec: clamp(
        patch.analysisIntervalSec ?? this.settings.analysisIntervalSec,
        SETTING_LIMITS.analysisIntervalSec,
      ),
      autoAnalysis: patch.autoAnalysis ?? this.settings.autoAnalysis,
      useAi: patch.useAi ?? this.settings.useAi,
    };
    this.trimMessages();
    return this.settings;
  }

  /** Removes all session data. Settings and the current connection state are kept. */
  clearData(): void {
    this.epoch += 1;
    this.messages = [];
    this.groups = [];
    this.analyses = [];
    this.seq = 0;
    this.groupCounter = 0;
    this.analysisCounter = 0;
    this.seenIds.clear();
    this.seenOrder = [];
    this.uniqueChatters.clear();
    this.counters = { received: 0, duplicatesDropped: 0, ignoredLines: 0 };
    this.lastAnalysisAt = null;
    this.lastAnalysisSeq = 0;
    this.lastAnalysisError = null;
  }

  get latestSeq(): number {
    return this.seq;
  }

  metrics(): SessionMetrics {
    const analysed = this.analyses[this.analyses.length - 1];
    return {
      messagesReceived: this.counters.received,
      messagesInBuffer: this.messages.length,
      duplicatesDropped: this.counters.duplicatesDropped,
      ignoredLines: this.counters.ignoredLines,
      uniqueChatters: this.uniqueChatters.size,
      questionGroups: this.groups.length,
      repeatedQuestionGroups: this.groups.filter((g) => g.count >= 2).length,
      openQuestionGroups: this.groups.filter((g) => g.status === "open").length,
      analysedMessages: analysed?.batchSize ?? 0,
    };
  }

  private rememberId(id: string): void {
    this.seenIds.add(id);
    this.seenOrder.push(id);
    if (this.seenOrder.length > MAX_SEEN_IDS) {
      const oldest = this.seenOrder.shift();
      if (oldest) this.seenIds.delete(oldest);
    }
  }

  private trimMessages(): void {
    const excess = this.messages.length - this.settings.bufferSize;
    if (excess > 0) this.messages.splice(0, excess);
  }
}

function clamp(value: number, limits: { min: number; max: number }): number {
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}
