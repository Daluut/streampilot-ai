// Minimal server logger. It only writes event names and error codes, never chat text,
// tokens, API keys or usernames.

type Level = "info" | "warn" | "error";

export function logEvent(level: Level, event: string, fields: Record<string, string | number | boolean | null> = {}): void {
  const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
