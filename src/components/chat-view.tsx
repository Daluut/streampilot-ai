"use client";

import { useMemo, useState } from "react";
import { Pause, Play, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, inputClass } from "./ui";
import { useSession } from "./session-provider";
import { formatClock } from "@/lib/client/format";
import type { ChatMessage, MessageKind } from "@/lib/types";

const MAX_RENDERED = 300;

type Filter = "all" | "question" | "suggestion" | "technical" | "reaction" | "broadcaster";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All messages" },
  { value: "question", label: "Questions" },
  { value: "suggestion", label: "Suggestions" },
  { value: "technical", label: "Technical reports" },
  { value: "reaction", label: "Reactions" },
  { value: "broadcaster", label: "Broadcaster" },
];

const KIND_LABEL: Record<MessageKind, string | null> = {
  question: "Question",
  suggestion: "Suggestion",
  technical: "Technical",
  reaction: "Reaction",
  other: null,
};

function matchesFilter(message: ChatMessage, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "broadcaster") return message.isBroadcaster;
  return message.kind === filter;
}

export function ChatView() {
  const { snapshot, messages } = useSession();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [frozen, setFrozen] = useState<ChatMessage[]>([]);

  const source = pausedAt === null ? messages : frozen;
  const newWhilePaused = pausedAt === null ? 0 : Math.max(0, messages.filter((m) => m.seq > pausedAt).length);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result: ChatMessage[] = [];
    for (let i = source.length - 1; i >= 0 && result.length < MAX_RENDERED; i -= 1) {
      const message = source[i];
      if (!matchesFilter(message, filter)) continue;
      if (needle && !message.text.toLowerCase().includes(needle) && !message.username.toLowerCase().includes(needle)) continue;
      result.push(message);
    }
    return result;
  }, [source, query, filter]);

  const togglePause = () => {
    if (pausedAt === null) {
      setFrozen(messages);
      setPausedAt(messages.length > 0 ? messages[messages.length - 1].seq : 0);
    } else {
      setPausedAt(null);
      setFrozen([]);
    }
  };

  const sourceLabel = !snapshot
    ? "Loading session…"
    : snapshot.source === "live"
      ? `Live data from #${snapshot.channel}. Pausing only stops the display; the connection keeps receiving chat.`
      : snapshot.source === "demo"
        ? "Demo data: synthetic messages from a fictional channel, not a real stream."
        : "No data yet.";

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">{sourceLabel}</p>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" />
            <label htmlFor="chat-search" className="sr-only">Search messages or usernames</label>
            <input
              id="chat-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages or usernames"
              className={`${inputClass} pl-9`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="chat-filter" className="sr-only">Filter messages</label>
            <select
              id="chat-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-accent-strong"
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <Button onClick={togglePause} variant="secondary" aria-pressed={pausedAt !== null} disabled={messages.length === 0 && pausedAt === null}>
              {pausedAt === null ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
              {pausedAt === null ? "Pause display" : "Resume display"}
            </Button>
          </div>
        </div>

        {pausedAt !== null ? (
          <div role="status" className="border-b border-line bg-warn/10 px-4 py-2 text-xs text-amber-100">
            Display paused{newWhilePaused > 0 ? ` · ${newWhilePaused} new message${newWhilePaused === 1 ? "" : "s"} not shown yet` : ""}. Messages keep arriving in the background.
          </div>
        ) : null}

        <div className="flex items-center justify-between px-4 py-2 text-xs text-muted">
          <span>
            Showing {filtered.length}
            {filtered.length === MAX_RENDERED ? ` (latest ${MAX_RENDERED})` : ""} of {source.length} buffered messages, newest first
          </span>
          {snapshot ? <span>Buffer limit {snapshot.settings.bufferSize}</span> : null}
        </div>

        {messages.length === 0 ? (
          <EmptyState title="No chat messages yet">
            {snapshot?.source === "live"
              ? snapshot.connection.status === "connected"
                ? "Connected. Messages appear here as viewers chat."
                : "Waiting for the connection. Messages appear here once Twitch confirms the join."
              : "Connect to a Twitch channel above, or try demo mode from the Overview page."}
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState title="No messages match these filters" />
        ) : (
          <ol aria-label="Chat messages" className="max-h-[70vh] divide-y divide-line/70 overflow-y-auto">
            {filtered.map((message) => (
              <li key={message.seq} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-4 py-2.5 text-sm md:grid-cols-[auto_9rem_1fr]">
                <time dateTime={message.timestamp} className="pt-0.5 font-mono text-[11px] text-muted md:text-xs">{formatClock(message.timestamp)}</time>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:block">
                  <span className={`truncate font-medium ${message.isBroadcaster ? "text-amber-300" : message.isModerator ? "text-emerald-300" : "text-accent-strong"}`}>
                    {message.username}
                  </span>
                  {message.isBroadcaster ? <Badge tone="demo">Broadcaster</Badge> : null}
                  {message.isModerator ? <Badge tone="ok">Mod</Badge> : null}
                </div>
                <p className="col-span-2 min-w-0 break-words text-ink/90 md:col-span-1 md:col-start-3">
                  {message.text}
                  {message.truncated ? <span className="text-muted"> (truncated)</span> : null}
                  {KIND_LABEL[message.kind] ? (
                    <span className="ml-2 align-middle">
                      <Badge tone={message.kind === "question" ? "accent" : "neutral"}>{KIND_LABEL[message.kind]}</Badge>
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
