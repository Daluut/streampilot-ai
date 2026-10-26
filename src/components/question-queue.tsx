"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, inputClass } from "./ui";
import { CopyButton } from "./copy-button";
import { useSession, useNow } from "./session-provider";
import { formatClock, formatRelative, pluralise } from "@/lib/client/format";
import type { QuestionGroup } from "@/lib/types";

type StatusFilter = "open" | "handled" | "all";
type Group = Omit<QuestionGroup, "tokens">;

export function QuestionQueue() {
  const { snapshot, setQuestionStatus, analyse } = useSession();
  const now = useNow();
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const groups = useMemo<Group[]>(() => snapshot?.questionGroups ?? [], [snapshot]);
  const counts = {
    open: groups.filter((g) => g.status === "open").length,
    handled: groups.filter((g) => g.status === "handled").length,
    all: groups.length,
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .filter((g) => filter === "all" || g.status === filter)
      .filter((g) => !needle || g.canonical.toLowerCase().includes(needle) || g.examples.some((e) => e.text.toLowerCase().includes(needle)))
      .sort((a, b) => b.count - a.count || b.latestSeq - a.latestSeq);
  }, [groups, filter, query]);

  const latestSuggestions = snapshot?.analyses[0]?.suggestions ?? [];

  const toggle = async (group: Group) => {
    setBusyId(group.id);
    await setQuestionStatus(group.id, group.status === "open" ? "handled" : "open");
    setBusyId(null);
  };

  const tabs: { value: StatusFilter; label: string }[] = [
    { value: "open", label: `Open (${counts.open})` },
    { value: "handled", label: `Handled (${counts.handled})` },
    { value: "all", label: `All (${counts.all})` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Question status" className="inline-flex w-fit rounded-md border border-line bg-panel p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={filter === tab.value}
              onClick={() => setFilter(tab.value)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent-strong ${
                filter === tab.value ? "bg-raised text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search aria-hidden className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" />
          <label htmlFor="question-search" className="sr-only">Search questions</label>
          <input id="question-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions" className={`${inputClass} pl-9`} />
        </div>
      </div>

      <p className="text-xs text-muted">
        Handled status is kept in this server session. It is cleared when the server restarts or when you clear session data.
      </p>

      {groups.length === 0 ? (
        <Card>
          <EmptyState title="No questions detected yet">
            When viewers ask questions, StreamPilot groups similar ones here so you can see which asks repeat. Start the demo or connect to a channel to see it work.
          </EmptyState>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState title={filter === "handled" ? "Nothing marked as handled yet" : "No open questions match"}>
            {filter === "open" && counts.open === 0 ? "Every detected question is marked handled." : "Try another tab or search term."}
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-3" aria-label="Detected questions">
          {visible.map((group) => {
            const suggestion = latestSuggestions.find((s) => s.text.includes(`"${group.canonical}"`));
            return (
              <QuestionCard
                key={group.id}
                group={group}
                now={now}
                busy={busyId === group.id}
                suggestionText={suggestion?.text ?? null}
                onToggle={() => toggle(group)}
              />
            );
          })}
        </ul>
      )}

      {counts.open > 0 && latestSuggestions.length === 0 ? (
        <p className="text-xs text-muted">
          Suggested responses appear after an analysis runs. <button type="button" onClick={() => analyse()} className="text-accent-strong underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent-strong">Run analysis now</button>.
        </p>
      ) : null}
    </div>
  );
}

function QuestionCard({
  group,
  now,
  busy,
  suggestionText,
  onToggle,
}: {
  group: Group;
  now: number;
  busy: boolean;
  suggestionText: string | null;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const handled = group.status === "handled";
  return (
    <li>
      <Card as="article" className={`p-4 ${handled ? "opacity-75" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={handled ? "ok" : "accent"}>{handled ? "Handled" : "Open"}</Badge>
              <Badge tone="neutral">{pluralise(group.count, "message")}</Badge>
              <Badge tone="neutral">{pluralise(group.uniqueAskers, "viewer")}</Badge>
              {group.responseDetected ? <Badge tone="info">Reply visible</Badge> : <Badge tone="warn">No response detected</Badge>}
            </div>
            <h3 className="mt-2 text-sm font-medium text-ink break-words">{group.canonical}</h3>
            <p className="mt-1 text-xs text-muted">
              Latest {formatRelative(group.latestAt, now)} at {formatClock(group.latestAt)}
              {group.responseDetected ? "" : " · No response detected in the available chat window."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <CopyButton text={group.canonical} label="Copy question" />
            <Button variant={handled ? "secondary" : "primary"} onClick={onToggle} loading={busy} className="min-w-[8.5rem]">
              {handled ? <Circle aria-hidden className="size-4" /> : <CheckCircle2 aria-hidden className="size-4" />}
              {handled ? "Reopen" : "Mark handled"}
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 inline-flex items-center gap-1 text-xs text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-strong"
        >
          {expanded ? <ChevronUp aria-hidden className="size-3.5" /> : <ChevronDown aria-hidden className="size-3.5" />}
          {expanded ? "Hide" : "Show"} representative messages
        </button>

        {expanded ? (
          <ul className="mt-2 space-y-1.5 border-l-2 border-line pl-3">
            {group.examples.map((example) => (
              <li key={example.seq} className="text-xs text-ink/80">
                <span className="text-muted">{example.username} · {formatClock(example.timestamp)}:</span> {example.text}
              </li>
            ))}
          </ul>
        ) : null}

        {suggestionText ? (
          <div className="mt-3 flex flex-col gap-2 rounded-md border border-line bg-canvas/60 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink/85">Suggested response: {suggestionText}</p>
            <CopyButton text={suggestionText} label="Copy suggestion" className="shrink-0" />
          </div>
        ) : null}
      </Card>
    </li>
  );
}
