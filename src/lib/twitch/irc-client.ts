// Twitch chat client over the documented IRC WebSocket endpoint.
// Connection states are only reported as "connected" after Twitch confirms the join
// (a JOIN for our own nick or a ROOMSTATE for the channel).

import { loginFromPrefix, parseIrcLine, splitFrame } from "./irc-parser";

export const DEFAULT_IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
export const MAX_RECONNECT_ATTEMPTS = 5;
export const CONNECT_TIMEOUT_MS = 15_000;
const BASE_RETRY_MS = 2_000;
const MAX_RETRY_MS = 30_000;

/** Twitch's documented anonymous read-only login. */
export const ANONYMOUS_PASS = "SCHMOOPIIE";

export interface IncomingChatMessage {
  id: string | null;
  channel: string;
  login: string;
  displayName: string | null;
  text: string;
  sentAt: string | null;
  badges: string;
}

export type ChatClientEvent =
  | { type: "status"; status: "connecting" | "connected" | "reconnecting" | "disconnected" | "error"; error?: string; attempt?: number; nextRetryAt?: string | null }
  | { type: "message"; message: IncomingChatMessage }
  | { type: "ignored"; reason: "unparseable" | "unknown_command" };

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export interface TwitchChatClientOptions {
  channel: string;
  url?: string;
  /** Optional user access token with chat:read. Never log or expose this value. */
  oauth?: { token: string; login: string };
  onEvent: (event: ChatClientEvent) => void;
  createSocket?: SocketFactory;
  random?: () => number;
  now?: () => Date;
}

/** Errors Twitch reports that a retry cannot fix. */
const FATAL_NOTICE_MESSAGES: Record<string, string> = {
  login_unsuccessful: "Twitch rejected the chat login. Check TWITCH_OAUTH_TOKEN and TWITCH_LOGIN, or remove them to connect anonymously.",
  improperly_formatted_auth: "Twitch rejected the chat login because the token was malformed.",
  msg_channel_suspended: "This Twitch channel is suspended or does not exist.",
  msg_room_not_found: "This Twitch channel does not exist.",
  msg_banned: "The chat login is banned from this channel.",
};

export function retryDelayMs(attempt: number): number {
  return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, attempt - 1));
}

/**
 * Owns one IRC WebSocket connection to a single channel. Handles the join handshake,
 * PING/PONG, RECONNECT requests, connect timeouts and bounded exponential backoff.
 */
export class TwitchChatClient {
  private readonly channel: string;
  private readonly url: string;
  private readonly oauth: TwitchChatClientOptions["oauth"];
  private readonly onEvent: (event: ChatClientEvent) => void;
  private readonly createSocket: SocketFactory;
  private readonly random: () => number;
  private readonly now: () => Date;

  private socket: SocketLike | null = null;
  private nick: string;
  private joined = false;
  private stopped = true;
  private attempt = 0;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: TwitchChatClientOptions) {
    this.channel = options.channel;
    this.url = options.url ?? DEFAULT_IRC_URL;
    this.oauth = options.oauth;
    this.onEvent = options.onEvent;
    this.createSocket = options.createSocket ?? defaultSocketFactory;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => new Date());
    this.nick = options.oauth?.login ?? `justinfan${10000 + Math.floor(this.random() * 89999)}`;
  }

  get isRunning(): boolean {
    return !this.stopped;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempt = 0;
    this.openSocket("connecting");
  }

  /** Stops the connection without scheduling any reconnect. */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    this.joined = false;
    if (socket) {
      try {
        socket.close(1000, "client disconnect");
      } catch {
        // Closing an already-closed socket is harmless.
      }
    }
    this.onEvent({ type: "status", status: "disconnected" });
  }

  private openSocket(status: "connecting" | "reconnecting"): void {
    this.clearTimers();
    this.joined = false;
    this.onEvent({ type: "status", status, attempt: this.attempt });

    let socket: SocketLike;
    try {
      socket = this.createSocket(this.url);
    } catch {
      this.handleFailure("Could not open the Twitch chat connection.");
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.sendHandshake();
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.handleFrame(String(event.data));
    };
    socket.onerror = () => {
      // The close event that follows carries the recovery logic.
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.joined = false;
      if (this.stopped) return;
      this.handleFailure("The Twitch chat connection closed unexpectedly.");
    };

    this.connectTimer = setTimeout(() => {
      if (this.socket === socket && !this.joined) {
        this.closeCurrentSocket();
        this.handleFailure("Timed out waiting for Twitch to confirm the channel join.");
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private sendHandshake(): void {
    const socket = this.socket;
    if (!socket) return;
    socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    if (this.oauth) {
      socket.send(`PASS oauth:${this.oauth.token.replace(/^oauth:/, "")}`);
      socket.send(`NICK ${this.oauth.login}`);
    } else {
      socket.send(`PASS ${ANONYMOUS_PASS}`);
      socket.send(`NICK ${this.nick}`);
    }
    socket.send(`JOIN #${this.channel}`);
  }

  private handleFrame(frame: string): void {
    for (const line of splitFrame(frame)) {
      const parsed = parseIrcLine(line);
      if (!parsed) {
        this.onEvent({ type: "ignored", reason: "unparseable" });
        continue;
      }
      switch (parsed.command) {
        case "PING":
          this.socket?.send(`PONG :${parsed.trailing ?? "tmi.twitch.tv"}`);
          break;
        case "RECONNECT":
          this.closeCurrentSocket();
          this.handleFailure("Twitch asked the client to reconnect.", { immediate: true });
          break;
        case "ROOMSTATE":
          if (parsed.params[0] === `#${this.channel}`) this.markJoined();
          break;
        case "JOIN":
          if (loginFromPrefix(parsed.prefix) === this.nick && parsed.params[0] === `#${this.channel}`) {
            this.markJoined();
          }
          break;
        case "NOTICE": {
          const messageId = parsed.tags["msg-id"] ?? "";
          const fatal = FATAL_NOTICE_MESSAGES[messageId];
          if (fatal) this.failFatally(fatal);
          break;
        }
        case "PRIVMSG":
          this.handlePrivmsg(parsed);
          break;
        default:
          break;
      }
    }
  }

  private handlePrivmsg(parsed: ReturnType<typeof parseIrcLine> & object): void {
    const channel = parsed.params[0]?.replace(/^#/, "");
    const login = loginFromPrefix(parsed.prefix);
    const text = parsed.trailing;
    if (!channel || !login || text === null) {
      this.onEvent({ type: "ignored", reason: "unknown_command" });
      return;
    }
    const sentAt = parsed.tags["tmi-sent-ts"];
    const sentMs = sentAt ? Number(sentAt) : Number.NaN;
    this.onEvent({
      type: "message",
      message: {
        id: parsed.tags.id || null,
        channel,
        login,
        displayName: parsed.tags["display-name"] || null,
        text,
        sentAt: Number.isFinite(sentMs) ? new Date(sentMs).toISOString() : this.now().toISOString(),
        badges: parsed.tags.badges ?? "",
      },
    });
  }

  private markJoined(): void {
    if (this.joined || this.stopped) return;
    this.joined = true;
    this.attempt = 0;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.onEvent({ type: "status", status: "connected" });
  }

  private handleFailure(reason: string, options: { immediate?: boolean } = {}): void {
    if (this.stopped) return;
    this.clearTimers();
    this.attempt += 1;
    if (this.attempt > MAX_RECONNECT_ATTEMPTS) {
      this.stopped = true;
      this.onEvent({
        type: "status",
        status: "error",
        error: `${reason} Gave up after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts. Check your network and try connecting again.`,
      });
      return;
    }
    const delay = options.immediate ? 0 : retryDelayMs(this.attempt);
    const nextRetryAt = new Date(this.now().getTime() + delay).toISOString();
    this.onEvent({ type: "status", status: "reconnecting", error: reason, attempt: this.attempt, nextRetryAt });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.openSocket("reconnecting");
    }, delay);
  }

  /** Non-recoverable failures (bad token, missing channel) stop reconnect attempts. */
  private failFatally(message: string): void {
    this.closeCurrentSocket();
    this.stopped = true;
    this.clearTimers();
    this.onEvent({ type: "status", status: "error", error: message });
  }

  private closeCurrentSocket(): void {
    const socket = this.socket;
    this.socket = null;
    this.joined = false;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (socket) {
      try {
        socket.close(1000, "reconnecting");
      } catch {
        // Ignore close errors on sockets that are already gone.
      }
    }
  }

  private clearTimers(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.connectTimer = null;
    this.retryTimer = null;
  }
}

function defaultSocketFactory(url: string): SocketLike {
  // Node 22+ provides a global WebSocket client.
  return new WebSocket(url) as unknown as SocketLike;
}
