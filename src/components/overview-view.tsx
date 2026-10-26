"use client";

import Link from "next/link";
import { Activity, MessageSquareText, Repeat2, ShieldAlert, Users } from "lucide-react";
import { Card, CardHeader, EmptyState, Banner } from "./ui";
import { ConnectPanel } from "./connect-panel";
import { DemoPanel } from "./demo-panel";
import { SummaryBlock, SuggestionList, TopicList, QuestionMini } from "./analysis-views";
import { useNow, useSession } from "./session-provider";
import { formatClock, formatRelative } from "@/lib/client/format";
import type { ChatMessage } from "@/lib/types";

export function OverviewView() {
  const { snapshot, messages, syncError } = useSession();
  const now = useNow();
  const latest = snapshot?.analyses[0] ?? null;
  const metrics = snapshot?.metrics;

  return (
    <div className="space-y-4">
      {syncError ? (
        <Banner tone="bad" title="Lost contact with the StreamPilot server">
          {syncError} The page keeps retrying every second. Chat is still processed by the server.
        </Banner>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <ConnectPanel />
        <DemoPanel />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={<MessageSquareText aria-hidden className="size-4" />} label="Messages this session" value={metrics?.messagesReceived ?? 0} />
        <Stat icon={<Users aria-hidden className="size-4" />} label="Unique chatters seen" value={metrics?.uniqueChatters ?? 0} />
        <Stat icon={<Activity aria-hidden className="size-4" />} label="Messages in last analysis" value={metrics?.analysedMessages ?? 0} />
        <Stat icon={<Repeat2 aria-hidden className="size-4" />} label="Repeated questions" value={metrics?.repeatedQuestionGroups ?? 0} />
        <Stat icon={<ShieldAlert aria-hidden className="size-4" />} label="Last analysis" value={formatRelative(snapshot?.analysis.lastAt ?? null, now)} small />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Recent summary" description="What the chat is about right now." action={<Link href="/insights" className="text-xs text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-accent-strong">All insights</Link>} />
          <SummaryBlock analysis={latest} now={now} />
        </Card>
        <Card>
          <CardHeader title="Key insights" description="Recommended actions from the latest analysis." />
          <SuggestionList analysis={latest} limit={3} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Recurring questions" description="Open questions asked more than once." action={<Link href="/questions" className="text-xs text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-accent-strong">Question queue</Link>} />
          <QuestionMini groups={snapshot?.questionGroups ?? []} />
        </Card>
        <Card>
          <CardHeader title="Topic activity" description="Terms that recur across the analysis window." />
          <TopicList topics={latest?.topics ?? []} messages={messages} limit={4} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Message volume" description="Messages per 30 seconds over the last 10 minutes, from message timestamps." />
          <MessageVolume messages={messages} now={now} />
        </Card>
        <Card>
          <CardHeader title="Live chat preview" description="The latest messages. Open Live Chat for search and filters." action={<Link href="/chat" className="text-xs text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-accent-strong">Open chat</Link>} />
          <LivePreview messages={messages} />
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, small = false }: { icon: React.ReactNode; label: string; value: number | string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted">{icon}<span className="truncate">{label}</span></div>
      <p className={`mt-1.5 font-semibold text-ink tabular-nums ${small ? "text-sm" : "text-xl"}`}>{value}</p>
    </div>
  );
}

const BUCKET_MS = 30_000;
const BUCKETS = 20;

function MessageVolume({ messages, now }: { messages: ChatMessage[]; now: number }) {
  const start = now - BUCKET_MS * BUCKETS;
  const counts = new Array<number>(BUCKETS).fill(0);
  for (const message of messages) {
    const t = Date.parse(message.timestamp);
    if (Number.isNaN(t) || t < start || t > now) continue;
    counts[Math.min(BUCKETS - 1, Math.floor((t - start) / BUCKET_MS))] += 1;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <EmptyState title="No messages in the last 10 minutes">The chart fills in as chat arrives.</EmptyState>;
  }
  const max = Math.max(...counts, 1);
  return (
    <div className="p-4">
      <div role="img" aria-label={`Messages per 30 seconds over the last 10 minutes; total ${total}; peak ${max}.`} className="flex h-32 items-end gap-1">
        {counts.map((count, i) => (
          <div key={i} title={`${count} messages`} className="flex-1 rounded-t bg-accent/70" style={{ height: `${Math.max(count === 0 ? 2 : 6, (count / max) * 100)}%` }} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted"><span>10 min ago</span><span>now</span></div>
    </div>
  );
}

function LivePreview({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return <EmptyState title="No messages yet">Connect to a channel or start the demo to see chat here.</EmptyState>;
  }
  const latest = messages.slice(-8).reverse();
  return (
    <ul className="divide-y divide-line/70">
      {latest.map((m) => (
        <li key={m.seq} className="px-4 py-2 text-xs">
          <span className="font-mono text-muted">{formatClock(m.timestamp)}</span>{" "}
          <span className="font-medium text-accent-strong">{m.username}</span>
          <span className="text-muted">: </span>
          <span className="break-words text-ink/90">{m.text}</span>
        </li>
      ))}
    </ul>
  );
}
