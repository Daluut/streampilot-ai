// Integration: a real WebSocket connection to a local mock IRC server drives the runtime,
// the session store and the snapshot served to the browser.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { StreamPilotRuntime } from "@/lib/runtime";
import { readServerConfig } from "@/lib/config/server-config";
import type { AiAnalysisProvider } from "@/lib/analysis/ai-engine";

let server: WebSocketServer;
let port = 0;
const clients: WebSocket[] = [];
const joinedChannels: string[] = [];
let rejectLogin = false;

async function waitFor(check: () => boolean, timeoutMs = 4000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 20));
  }
}

beforeAll(async () => {
  server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((resolve) => server.on("listening", () => resolve()));
  port = (server.address() as { port: number }).port;
  server.on("connection", (socket) => {
    clients.push(socket);
    socket.on("message", (data) => {
      for (const line of String(data).split("\r\n")) {
        if (line.startsWith("JOIN ")) {
          const channel = line.slice(6).replace("#", "");
          joinedChannels.push(channel);
          if (rejectLogin) {
            socket.send("@msg-id=login_unsuccessful :tmi.twitch.tv NOTICE * :Login authentication failed\r\n");
            return;
          }
          socket.send(`:nick!nick@nick.tmi.twitch.tv JOIN #${channel}\r\n:tmi.twitch.tv ROOMSTATE #${channel}\r\n`);
        }
      }
    });
  });
});

afterAll(async () => {
  for (const c of clients) c.terminate();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function runtimeFor(env: Record<string, string> = {}, provider: AiAnalysisProvider | null = null) {
  const config = readServerConfig({ TWITCH_IRC_URL: `ws://127.0.0.1:${port}`, ...env });
  return new StreamPilotRuntime({ config, provider });
}

describe("live Twitch pipeline against a local IRC server", () => {
  it("reports connected only after the join is confirmed, then ingests chat", async () => {
    const runtime = runtimeFor();
    const result = runtime.connectLive({ channel: "Demo_Channel" });
    expect(result).toEqual({ ok: true, channel: "demo_channel" });
    expect(runtime.store.connection.status).toBe("connecting");

    await waitFor(() => runtime.store.connection.status === "connected");
    expect(joinedChannels).toContain("demo_channel");

    const server = clients[clients.length - 1];
    server.send(
      "@badges=broadcaster/1;display-name=HostUser;id=b-1;tmi-sent-ts=1700000000000 :host!host@host.tmi.twitch.tv PRIVMSG #demo_channel :The sword is my main weapon\r\n" +
        "@display-name=Viewer1;id=v-1;tmi-sent-ts=1700000001000 :viewer1!viewer1@viewer1.tmi.twitch.tv PRIVMSG #demo_channel :what weapon are you using?\r\n" +
        "@display-name=Viewer1;id=v-1;tmi-sent-ts=1700000001000 :viewer1!viewer1@viewer1.tmi.twitch.tv PRIVMSG #demo_channel :what weapon are you using?\r\n",
    );
    await waitFor(() => runtime.store.messages.length >= 2);

    const snapshot = runtime.snapshot(0);
    expect(snapshot.source).toBe("live");
    expect(snapshot.channel).toBe("demo_channel");
    expect(snapshot.messages.map((m) => m.username)).toEqual(["HostUser", "Viewer1"]);
    expect(snapshot.messages[0].isBroadcaster).toBe(true);
    expect(snapshot.messages[1].source).toBe("twitch");
    expect(snapshot.metrics.duplicatesDropped).toBe(1);
    expect(snapshot.questionGroups).toHaveLength(1);

    runtime.disconnectLive();
    expect(runtime.store.connection.status).toBe("disconnected");
  });

  it("surfaces a rejected login as an error and does not pretend to be connected", async () => {
    rejectLogin = true;
    try {
      const runtime = runtimeFor({ TWITCH_OAUTH_TOKEN: "bad-token", TWITCH_LOGIN: "bot_user" });
      runtime.connectLive({ channel: "some_channel" });
      await waitFor(() => runtime.store.connection.status === "error");
      expect(runtime.store.connection.error).toMatch(/Twitch rejected the chat login/);
      expect(runtime.store.connection.status).not.toBe("connected");
      runtime.disconnectLive();
    } finally {
      rejectLogin = false;
    }
  });

  it("refuses to connect when the token configuration is incomplete", () => {
    const runtime = runtimeFor({ TWITCH_OAUTH_TOKEN: "only-token" });
    const result = runtime.connectLive({ channel: "some_channel" });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid channel names before opening any connection", () => {
    const runtime = runtimeFor();
    expect(runtime.connectLive({ channel: "bad name!" })).toMatchObject({ ok: false });
    expect(runtime.store.connection.status).toBe("disconnected");
  });
});

describe("demo and analysis pipeline", () => {
  it("runs the scripted demo through the runtime and produces grounded analysis", async () => {
    const runtime = new StreamPilotRuntime({
      config: readServerConfig({}),
      provider: null,
      demoIntervalMs: 2,
    });
    runtime.startDemo();
    expect(runtime.store.source).toBe("demo");
    await waitFor(() => runtime.store.demoStatus === "finished", 10_000);

    const snapshot = runtime.snapshot(0);
    expect(snapshot.messages.every((m) => m.source === "demo")).toBe(true);
    expect(snapshot.messages.some((m) => m.isBroadcaster)).toBe(true);
    expect(snapshot.metrics.repeatedQuestionGroups).toBeGreaterThanOrEqual(1);

    const outcome = await runtime.runAnalysis({ manual: true });
    expect(outcome.status).toBe("ran");
    if (outcome.status !== "ran") return;
    expect(outcome.analysis.mode).toBe("local");
    expect(outcome.analysis.engineLabel).toBe("Local rules");
    expect(outcome.analysis.topics.map((t) => t.label)).toContain("weapon");
    expect(outcome.analysis.suggestions.some((s) => s.text.includes("messages ask"))).toBe(true);

    runtime.resetDemo();
    expect(runtime.store.source).toBe("none");
    expect(runtime.store.messages).toHaveLength(0);
  });

  it("enforces a manual analysis cooldown and never overlaps analysis runs", async () => {
    const runtime = new StreamPilotRuntime({ config: readServerConfig({}), provider: null });
    for (const text of ["what weapon are you using?", "which weapon do you use", "nice shot", "crossbow is strong", "boss is hard"]) {
      runtime.store.ingest({ id: null, source: "demo", channel: "demo", username: "v", text, timestamp: new Date().toISOString(), isBroadcaster: false, isModerator: false });
    }
    const first = await runtime.runAnalysis({ manual: true });
    expect(first.status).toBe("ran");
    const second = await runtime.runAnalysis({ manual: true });
    expect(second.status).toBe("cooldown");
  });
});
