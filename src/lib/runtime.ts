// The StreamPilot runtime: owns the single active data source (live Twitch chat or demo),
// the analysis scheduler and the snapshot served to the browser. It lives on globalThis so
// that Next.js route handlers share one instance within the server process.

import { analyseBatch } from "@/lib/analysis/analyzer";
import { AI_TIMEOUT_MS, AnthropicAnalysisProvider, type AiAnalysisProvider } from "@/lib/analysis/ai-engine";
import { DEMO_CHANNEL, type DemoScriptLine } from "@/lib/demo/script";
import type { SessionSnapshot } from "@/lib/runtime-types";
import { DemoSimulator } from "@/lib/demo/simulator";
import { readServerConfig, type ServerConfig } from "@/lib/config/server-config";
import { logEvent } from "@/lib/logger";
import { SETTING_LIMITS } from "@/lib/settings/schema";
import { IDLE_CONNECTION, SessionStore, toPublicQuestionGroup, type IngestInput } from "@/lib/state/session-store";
import type { AnalysisResult, SessionSettings } from "@/lib/types";
import { type ChatClientEvent, type SocketFactory, TwitchChatClient } from "@/lib/twitch/irc-client";
import { parseChannelName } from "@/lib/twitch/channel";

export const ANALYSIS_BATCH_SIZE = 60;
export const MANUAL_ANALYSIS_COOLDOWN_MS = 5_000;
const SCHEDULER_TICK_MS = 5_000;

export type { SessionSnapshot };

export type AnalysisOutcome =
  | { status: "ran"; analysis: AnalysisResult }
  | { status: "busy" }
  | { status: "cooldown"; retryInMs: number }
  | { status: "no_messages" }
  | { status: "failed"; message: string };

export interface RuntimeOptions {
  config?: ServerConfig;
  provider?: AiAnalysisProvider | null;
  createSocket?: SocketFactory;
  store?: SessionStore;
  now?: () => Date;
  demoIntervalMs?: number;
}

export class StreamPilotRuntime {
  readonly store: SessionStore;
  private readonly config: ServerConfig;
  private readonly provider: AiAnalysisProvider | null;
  private readonly createSocket: SocketFactory | undefined;
  private readonly now: () => Date;
  private readonly demo: DemoSimulator;
  private twitch: TwitchChatClient | null = null;
  private demoCounter = 0;
  private lastManualAt = 0;
  private scheduler: ReturnType<typeof setInterval> | null = null;

  constructor(options: RuntimeOptions = {}) {
    this.store = options.store ?? new SessionStore();
    this.config = options.config ?? readServerConfig();
    this.provider = options.provider ?? null;
    this.createSocket = options.createSocket;
    this.now = options.now ?? (() => new Date());
    this.demo = new DemoSimulator({
      emit: (line) => this.emitDemoLine(line),
      onFinished: () => {
        this.store.demoStatus = "finished";
      },
      intervalMs: options.demoIntervalMs,
    });
  }

  /** Starts the background loop that runs automatic analysis while a source is active. */
  startScheduler(): void {
    if (this.scheduler) return;
    this.scheduler = setInterval(() => this.checkAutoAnalysis(), SCHEDULER_TICK_MS);
    this.scheduler.unref?.();
  }

  // ---- Live Twitch chat ---------------------------------------------------

  connectLive(input: unknown): { ok: true; channel: string } | { ok: false; error: string } {
    const parsed = parseChannelName(typeof input === "object" && input !== null ? (input as { channel?: unknown }).channel : undefined);
    if (!parsed.ok) return { ok: false, error: parsed.reason };
    if (this.config.configError) {
      return { ok: false, error: this.config.configError };
    }

    const channel = parsed.channel;
    const sameChannel = this.store.source === "live" && this.store.connection.channel === channel;
    this.stopLive();
    this.stopDemo();
    if (!sameChannel) this.store.clearData();
    this.store.source = "live";

    const client = new TwitchChatClient({
      channel,
      url: this.config.ircUrl,
      oauth: this.config.twitchOauth ?? undefined,
      createSocket: this.createSocket,
      onEvent: (event) => {
        if (this.twitch !== client) return;
        this.handleChatEvent(event, channel);
      },
    });
    this.twitch = client;
    this.store.connection = { ...IDLE_CONNECTION, status: "connecting", channel, since: this.now().toISOString() };
    client.start();
    logEvent("info", "live_connect_requested", { channel });
    return { ok: true, channel };
  }

  disconnectLive(): void {
    this.stopLive();
    this.store.connection = { ...this.store.connection, status: "disconnected", error: null, attempt: 0, nextRetryAt: null };
  }

  private stopLive(): void {
    const client = this.twitch;
    this.twitch = null;
    client?.stop();
  }

  private handleChatEvent(event: ChatClientEvent, channel: string): void {
    switch (event.type) {
      case "status": {
        const previous = this.store.connection;
        this.store.connection = {
          status: event.status,
          channel,
          error: event.error ?? null,
          since: event.status === "connected" ? this.now().toISOString() : previous.since,
          attempt: event.attempt ?? 0,
          nextRetryAt: event.nextRetryAt ?? null,
        };
        if (event.status === "error") logEvent("warn", "live_connection_error", { channel });
        break;
      }
      case "message": {
        const { message } = event;
        const badges = message.badges;
        const input: IngestInput = {
          id: message.id,
          source: "twitch",
          channel: message.channel,
          username: message.displayName ?? message.login,
          text: message.text,
          timestamp: message.sentAt ?? this.now().toISOString(),
          isBroadcaster: badges.includes("broadcaster/"),
          isModerator: badges.includes("moderator/"),
        };
        this.store.ingest(input);
        break;
      }
      case "ignored":
        this.store.recordIgnoredLine();
        break;
    }
  }

  // ---- Demo mode ----------------------------------------------------------

  startDemo(): void {
    if (this.store.demoStatus === "running" || this.store.demoStatus === "paused") return;
    this.stopLive();
    this.store.connection = { ...IDLE_CONNECTION };
    if (this.store.demoStatus === "stopped" || this.store.demoStatus === "finished" || this.store.source !== "demo") {
      this.store.clearData();
    }
    this.store.source = "demo";
    this.demo.start();
    this.store.demoStatus = "running";
  }

  pauseDemo(): void {
    this.demo.pause();
    this.store.demoStatus = this.demo.currentStatus;
  }

  resumeDemo(): void {
    this.demo.resume();
    this.store.demoStatus = this.demo.currentStatus;
  }

  /** Stops the demo and removes its messages, returning the session to an empty state. */
  resetDemo(): void {
    this.stopDemo();
    this.store.clearData();
    this.store.source = "none";
    this.store.demoStatus = "stopped";
  }

  private stopDemo(): void {
    this.demo.stop();
    if (this.store.demoStatus !== "finished") this.store.demoStatus = "stopped";
  }

  private emitDemoLine(line: DemoScriptLine): void {
    this.demoCounter += 1;
    this.store.ingest({
      id: `demo-${this.demoCounter}`,
      source: "demo",
      channel: DEMO_CHANNEL,
      username: line.username,
      text: line.text,
      timestamp: this.now().toISOString(),
      isBroadcaster: line.broadcaster === true,
      isModerator: false,
    });
  }

  // ---- Analysis -----------------------------------------------------------

  async runAnalysis(options: { manual: boolean }): Promise<AnalysisOutcome> {
    const store = this.store;
    if (store.analysisInFlight) return { status: "busy" };
    if (store.messages.length === 0) return { status: "no_messages" };

    const now = this.now();
    if (options.manual) {
      const elapsed = now.getTime() - this.lastManualAt;
      if (this.lastManualAt > 0 && elapsed < MANUAL_ANALYSIS_COOLDOWN_MS) {
        return { status: "cooldown", retryInMs: MANUAL_ANALYSIS_COOLDOWN_MS - elapsed };
      }
      this.lastManualAt = now.getTime();
    }

    store.analysisInFlight = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS + 2_000);
    try {
      const provider = store.settings.useAi ? this.provider : null;
      const { result, topicLabelsBySeq } = await analyseBatch({
        batch: store.recentBatch(ANALYSIS_BATCH_SIZE),
        groups: store.groups,
        provider,
        analysisId: store.nextAnalysisId(),
        now,
        signal: controller.signal,
      });
      store.applyAnalysis(result, topicLabelsBySeq);
      logEvent("info", "analysis_completed", { mode: result.mode, batchSize: result.batchSize });
      return { status: "ran", analysis: result };
    } catch {
      // Skip this batch so the scheduler does not retry it every tick.
      store.lastAnalysisSeq = store.latestSeq;
      store.lastAnalysisAt = now.toISOString();
      store.lastAnalysisError = "Analysis failed unexpectedly. Try again in a moment.";
      logEvent("error", "analysis_unexpected_failure");
      return { status: "failed", message: store.lastAnalysisError };
    } finally {
      clearTimeout(timeout);
      store.analysisInFlight = false;
    }
  }

  /** Runs automatic analysis when the interval has elapsed and new messages exist. */
  checkAutoAnalysis(): void {
    const store = this.store;
    if (!store.settings.autoAnalysis || store.source === "none") return;
    if (store.messages.length === 0 || store.latestSeq <= store.lastAnalysisSeq) return;
    const last = store.lastAnalysisAt ? Date.parse(store.lastAnalysisAt) : 0;
    if (this.now().getTime() - last < store.settings.analysisIntervalSec * 1000) return;
    void this.runAnalysis({ manual: false });
  }

  // ---- Question queue -----------------------------------------------------

  setQuestionStatus(groupId: string, status: "open" | "handled"): boolean {
    return this.store.setQuestionStatus(groupId, status) !== null;
  }

  // ---- Settings and data --------------------------------------------------

  updateSettings(patch: Partial<SessionSettings>): SessionSettings {
    return this.store.updateSettings(patch);
  }

  clearSession(): void {
    this.stopLive();
    this.stopDemo();
    this.store.connection = { ...IDLE_CONNECTION };
    this.store.source = "none";
    this.store.demoStatus = "stopped";
    this.store.clearData();
    logEvent("info", "session_cleared");
  }

  // ---- Snapshot -----------------------------------------------------------

  snapshot(afterSeq: number): SessionSnapshot {
    const store = this.store;
    const aiEnabled = store.settings.useAi && this.provider !== null;
    const latest = store.analyses[store.analyses.length - 1];
    const lastMs = store.lastAnalysisAt ? Date.parse(store.lastAnalysisAt) : null;
    const nextAt =
      store.settings.autoAnalysis && store.source !== "none" && lastMs !== null
        ? new Date(lastMs + store.settings.analysisIntervalSec * 1000).toISOString()
        : null;

    return {
      epoch: store.epoch,
      serverTime: this.now().toISOString(),
      source: store.source,
      channel: store.connection.channel ?? (store.source === "demo" ? DEMO_CHANNEL : null),
      connection: store.connection,
      demo: {
        status: store.demoStatus,
        emitted: this.demo.emittedCount,
        total: this.demo.totalCount,
        channel: DEMO_CHANNEL,
      },
      settings: store.settings,
      settingsLimits: SETTING_LIMITS,
      integrations: {
        twitchAuthMode: this.config.twitchAuthMode,
        twitchIrcUrl: this.config.ircUrl.replace(/\?.*$/, ""),
        aiConfigured: this.provider !== null,
        aiModel: this.provider?.model ?? null,
        aiEnabled,
        configError: this.config.configError,
      },
      analysis: {
        inFlight: store.analysisInFlight,
        lastAt: store.lastAnalysisAt,
        nextAt,
        error: store.lastAnalysisError,
        mode: latest?.mode ?? (aiEnabled ? "ai" : "local"),
        intervalSec: store.settings.analysisIntervalSec,
      },
      metrics: store.metrics(),
      questionGroups: store.groups.map(toPublicQuestionGroup),
      analyses: store.analyses.slice(-10).reverse(),
      messages: store.messagesAfter(afterSeq),
      latestSeq: store.latestSeq,
    };
  }

}

const RUNTIME_KEY = Symbol.for("streampilot.runtime");

/** Returns the process-wide runtime, creating it on first use. */
export function getRuntime(): StreamPilotRuntime {
  const holder = globalThis as unknown as Record<symbol, StreamPilotRuntime | undefined>;
  if (!holder[RUNTIME_KEY]) {
    const config = readServerConfig();
    const provider = config.anthropicApiKey
      ? new AnthropicAnalysisProvider({ apiKey: config.anthropicApiKey, model: config.anthropicModel })
      : null;
    const runtime = new StreamPilotRuntime({ config, provider });
    runtime.startScheduler();
    holder[RUNTIME_KEY] = runtime;
    logEvent("info", "runtime_started", { aiConfigured: provider !== null, twitchAuthMode: config.twitchAuthMode });
  }
  return holder[RUNTIME_KEY];
}
