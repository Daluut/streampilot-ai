// Twitch login names are 4–25 characters: letters, digits and underscores.
const CHANNEL_PATTERN = /^[a-z0-9_]{4,25}$/;

export type ChannelParseResult =
  | { ok: true; channel: string }
  | { ok: false; reason: string };

/** Normalises user input such as "#SomeChannel " to "somechannel" and validates it. */
export function parseChannelName(input: unknown): ChannelParseResult {
  if (typeof input !== "string") {
    return { ok: false, reason: "Enter a Twitch channel name." };
  }
  const normalised = input.trim().replace(/^#/, "").toLowerCase();
  if (normalised.length === 0) {
    return { ok: false, reason: "Enter a Twitch channel name." };
  }
  if (!CHANNEL_PATTERN.test(normalised)) {
    return {
      ok: false,
      reason: "Channel names use 4–25 letters, numbers or underscores, with no spaces or URLs.",
    };
  }
  return { ok: true, channel: normalised };
}
