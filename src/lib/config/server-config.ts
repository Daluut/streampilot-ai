// Server-only configuration read from environment variables. Secrets are never returned
// to the browser: the settings API only reports whether they are configured.

import { z } from "zod";
import { DEFAULT_IRC_URL } from "@/lib/twitch/irc-client";

export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5";

export interface ServerConfig {
  ircUrl: string;
  twitchAuthMode: "anonymous" | "token";
  twitchOauth: { token: string; login: string } | null;
  anthropicApiKey: string | null;
  anthropicModel: string;
  /** Human-readable problem with the configuration. Shown in Settings, never a crash. */
  configError: string | null;
}

const ircUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith("wss://") || /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(value),
    "TWITCH_IRC_URL must use wss:// (ws:// is only allowed for localhost test servers).",
  );

export function readServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const errors: string[] = [];

  const ircParsed = ircUrlSchema.safeParse(env.TWITCH_IRC_URL || DEFAULT_IRC_URL);
  if (!ircParsed.success) errors.push(ircParsed.error.issues[0]?.message ?? "Invalid TWITCH_IRC_URL.");

  const token = env.TWITCH_OAUTH_TOKEN?.trim() ?? "";
  const login = env.TWITCH_LOGIN?.trim().toLowerCase() ?? "";
  let twitchOauth: ServerConfig["twitchOauth"] = null;
  if (token || login) {
    if (token && login) {
      twitchOauth = { token, login };
    } else {
      errors.push("Set both TWITCH_OAUTH_TOKEN and TWITCH_LOGIN, or leave both empty to connect anonymously.");
    }
  }

  const apiKey = env.ANTHROPIC_API_KEY?.trim() || null;

  return {
    ircUrl: ircParsed.success ? ircParsed.data : DEFAULT_IRC_URL,
    twitchAuthMode: twitchOauth ? "token" : "anonymous",
    twitchOauth,
    anthropicApiKey: apiKey,
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
    configError: errors.length > 0 ? errors.join(" ") : null,
  };
}
