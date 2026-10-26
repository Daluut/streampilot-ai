import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONNECT_TIMEOUT_MS, MAX_RECONNECT_ATTEMPTS, TwitchChatClient, type ChatClientEvent, type SocketLike } from "@/lib/twitch/irc-client";

class FakeSocket implements SocketLike {
  readyState = 1;
  sent: string[] = [];
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onerror: SocketLike["onerror"] = null;
  onclose: SocketLike["onclose"] = null;
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; }
  open() { this.onopen?.({}); }
  frame(data: string) { this.onmessage?.({ data }); }
  drop() { this.readyState = 3; this.onclose?.({ code: 1006, reason: "" }); }
}

function setup(options: { oauth?: { token: string; login: string } } = {}) {
  const sockets: FakeSocket[] = [];
  const events: ChatClientEvent[] = [];
  const client = new TwitchChatClient({
    channel: "demo_chan",
    url: "wss://example.test:443",
    oauth: options.oauth,
    onEvent: (e) => events.push(e),
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    random: () => 0.5,
  });
  const statuses = () => events.filter((e): e is Extract<ChatClientEvent, { type: "status" }> => e.type === "status").map((e) => e.status);
  return { client, sockets, events, statuses };
}

describe("TwitchChatClient", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends an anonymous handshake and only reports connected after the join is confirmed", () => {
    const { client, sockets, statuses } = setup();
    client.start();
    const socket = sockets[0];
    socket.open();
    expect(socket.sent).toContain("PASS SCHMOOPIIE");
    expect(socket.sent.some((line) => line.startsWith("NICK justinfan"))).toBe(true);
    expect(socket.sent).toContain("JOIN #demo_chan");
    expect(statuses()).toEqual(["connecting"]);
    socket.frame(":tmi.twitch.tv ROOMSTATE #demo_chan\r\n");
    expect(statuses()).toEqual(["connecting", "connected"]);
    client.stop();
  });

  it("uses a token only when configured, and never reports it in events", () => {
    const { client, sockets, events } = setup({ oauth: { token: "secret-token", login: "viewer_bot" } });
    client.start();
    sockets[0].open();
    expect(sockets[0].sent).toContain("PASS oauth:secret-token");
    expect(sockets[0].sent).toContain("NICK viewer_bot");
    sockets[0].frame(":tmi.twitch.tv ROOMSTATE #demo_chan\r\n");
    expect(JSON.stringify(events)).not.toContain("secret-token");
    client.stop();
  });

  it("parses chat messages and reports ignored lines without crashing", () => {
    const { client, sockets, events } = setup();
    client.start();
    sockets[0].open();
    sockets[0].frame(":tmi.twitch.tv ROOMSTATE #demo_chan\r\n");
    sockets[0].frame("@badges=moderator/1;display-name=Viewer;id=msg-1;tmi-sent-ts=1700000000000 :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #demo_chan :hi\r\n");
    sockets[0].frame("@onlytags\r\n");
    const message = events.find((e) => e.type === "message");
    expect(message).toMatchObject({ type: "message", message: { id: "msg-1", displayName: "Viewer", text: "hi" } });
    expect(events.some((e) => e.type === "ignored")).toBe(true);
    client.stop();
  });

  it("answers PING with PONG", () => {
    const { client, sockets } = setup();
    client.start();
    sockets[0].open();
    sockets[0].frame("PING :tmi.twitch.tv\r\n");
    expect(sockets[0].sent).toContain("PONG :tmi.twitch.tv");
    client.stop();
  });

  it("reconnects with backoff after an unexpected drop", () => {
    const { client, sockets, statuses } = setup();
    client.start();
    sockets[0].open();
    sockets[0].frame(":tmi.twitch.tv ROOMSTATE #demo_chan\r\n");
    sockets[0].drop();
    expect(statuses().at(-1)).toBe("reconnecting");
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(2_000);
    expect(sockets).toHaveLength(2);
    client.stop();
  });

  it("does not reconnect after a user disconnect", () => {
    const { client, sockets, statuses } = setup();
    client.start();
    sockets[0].open();
    client.stop();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(statuses().at(-1)).toBe("disconnected");
  });

  it("gives up with an error after bounded retries instead of looping forever", () => {
    const { client, sockets, statuses } = setup();
    client.start();
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS + 1; i += 1) {
      const current = sockets[sockets.length - 1];
      current.open();
      vi.advanceTimersByTime(CONNECT_TIMEOUT_MS + 1);
      vi.advanceTimersByTime(60_000);
    }
    expect(statuses().at(-1)).toBe("error");
    expect(sockets.length).toBeLessThanOrEqual(MAX_RECONNECT_ATTEMPTS + 1);
  });

  it("treats a rejected login as fatal and does not retry", () => {
    const { client, sockets, events, statuses } = setup({ oauth: { token: "t", login: "bot" } });
    client.start();
    sockets[0].open();
    sockets[0].frame("@msg-id=login_unsuccessful :tmi.twitch.tv NOTICE * :Login authentication failed\r\n");
    const last = events.at(-1);
    expect(last).toMatchObject({ type: "status", status: "error" });
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(statuses().at(-1)).toBe("error");
  });

  it("honours a RECONNECT request immediately", () => {
    const { client, sockets } = setup();
    client.start();
    sockets[0].open();
    sockets[0].frame(":tmi.twitch.tv ROOMSTATE #demo_chan\r\n");
    sockets[0].frame("RECONNECT\r\n");
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    client.stop();
  });
});
