// Parser for Twitch IRC lines (RFC 1459 with IRCv3 message tags).
// Only the fields StreamPilot needs are extracted. Unknown or malformed lines return null.

export interface ParsedIrcLine {
  tags: Record<string, string>;
  /** Full prefix without the leading colon, e.g. "user!user@user.tmi.twitch.tv". */
  prefix: string | null;
  command: string;
  params: string[];
  trailing: string | null;
}

const TAG_ESCAPES: Record<string, string> = { s: " ", ":": ";", "\\": "\\", r: "\r", n: "\n" };

function unescapeTagValue(value: string): string {
  return value.replace(/\\(.)/g, (match, char: string) => TAG_ESCAPES[char] ?? char);
}

export function parseIrcLine(rawLine: string): ParsedIrcLine | null {
  let line = rawLine.replace(/\r?\n$/, "");
  if (line.length === 0) return null;

  const tags: Record<string, string> = {};
  if (line.startsWith("@")) {
    const end = line.indexOf(" ");
    if (end < 0) return null;
    for (const pair of line.slice(1, end).split(";")) {
      const eq = pair.indexOf("=");
      if (eq < 0) {
        tags[pair] = "";
      } else {
        tags[pair.slice(0, eq)] = unescapeTagValue(pair.slice(eq + 1));
      }
    }
    line = line.slice(end + 1).trimStart();
  }

  let prefix: string | null = null;
  if (line.startsWith(":")) {
    const end = line.indexOf(" ");
    if (end < 0) return null;
    prefix = line.slice(1, end);
    line = line.slice(end + 1).trimStart();
  }

  let trailing: string | null = null;
  const trailingIndex = line.indexOf(" :");
  if (trailingIndex >= 0) {
    trailing = line.slice(trailingIndex + 2);
    line = line.slice(0, trailingIndex);
  } else if (line.startsWith(":")) {
    trailing = line.slice(1);
    line = "";
  }

  const parts = line.split(" ").filter(Boolean);
  const command = parts.shift();
  if (!command) return null;

  return { tags, prefix, command: command.toUpperCase(), params: parts, trailing };
}

/** Splits a raw WebSocket frame into lines. Twitch sends one IRC message per line. */
export function splitFrame(frame: string): string[] {
  return frame.split("\r\n").filter((line) => line.length > 0);
}

/** Extracts the login name from a prefix such as "nick!nick@nick.tmi.twitch.tv". */
export function loginFromPrefix(prefix: string | null): string | null {
  if (!prefix) return null;
  const bang = prefix.indexOf("!");
  return bang > 0 ? prefix.slice(0, bang) : null;
}
