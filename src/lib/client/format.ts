export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatRelative(iso: string | null, now: number): string {
  if (!iso) return "Not yet";
  const diff = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (Number.isNaN(diff)) return "Unknown";
  if (diff < 5) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function formatCountdown(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const diff = Math.ceil((Date.parse(iso) - now) / 1000);
  if (Number.isNaN(diff)) return null;
  return diff <= 0 ? "now" : `in ${diff}s`;
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
