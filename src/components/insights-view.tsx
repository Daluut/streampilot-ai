"use client";

import { Play } from "lucide-react";
import { Banner, Button, Card, CardHeader, EmptyState } from "./ui";
import { AnalysisHistory, SectionCard, SentimentBar, SummaryBlock, SuggestionList, TopicList, QuestionMini } from "./analysis-views";
import { useNow, useSession } from "./session-provider";
import { formatCountdown, formatRelative } from "@/lib/client/format";
import { useState } from "react";

export function InsightsView() {
  const { snapshot, messages, analyse } = useSession();
  const now = useNow();
  const [running, setRunning] = useState(false);
  const latest = snapshot?.analyses[0] ?? null;
  const hasMessages = (snapshot?.metrics.messagesInBuffer ?? 0) > 0;
  const nextIn = snapshot?.analysis.nextAt ? formatCountdown(snapshot.analysis.nextAt, now) : null;

  const run = async () => {
    setRunning(true);
    await analyse();
    setRunning(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Current summary"
          description={
            snapshot?.analysis.intervalSec
              ? `Analysis covers the latest messages${snapshot.settings.autoAnalysis ? `, refreshed every ${snapshot.analysis.intervalSec}s` : " (automatic analysis is off)"}.`
              : "Analysis covers the latest messages."
          }
          action={
            <Button variant="primary" onClick={run} loading={running || snapshot?.analysis.inFlight === true} disabled={!hasMessages}>
              <Play aria-hidden className="size-4" />
              Run analysis now
            </Button>
          }
        />
        {snapshot?.analysis.error && !latest?.aiError ? (
          <div className="p-4 pb-0"><Banner tone="bad" title="Last analysis failed">{snapshot.analysis.error}</Banner></div>
        ) : null}
        <SummaryBlock analysis={latest} now={now} />
        {nextIn && snapshot?.analysis.nextAt ? (
          <p className="border-t border-line px-4 py-2 text-xs text-muted">Next automatic analysis {nextIn}.</p>
        ) : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Topic clusters" description="Terms repeated across real messages. Counts are exact for local rules; AI topics report the messages the model referenced." />
          {latest ? <TopicList topics={latest.topics} messages={messages} /> : <EmptyState title="No topics yet">Topics need an analysis run over several messages.</EmptyState>}
        </Card>
        <Card>
          <CardHeader title="Repeated questions" description="Open questions with similar wording from more than one message. Open the queue to mark them handled." />
          <QuestionMini groups={snapshot?.questionGroups ?? []} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Community reaction" description="Why it matters: a quick read of tone so you can tell whether chat is enjoying the moment." />
          <SentimentBar sentiment={latest?.sentiment ?? null} />
        </Card>
        <Card>
          <CardHeader title="Recommended actions" description="Optional responses grounded in the chat above. Copy one if it fits; nothing is posted automatically." />
          <SuggestionList analysis={latest} />
        </Card>
      </div>

      <SectionCard title="Analysis history" description="The latest analysis runs, newest first.">
        <AnalysisHistory analyses={snapshot?.analyses ?? []} now={now} />
      </SectionCard>

      <p className="text-xs text-muted">
        Analysis last ran {formatRelative(snapshot?.analysis.lastAt ?? null, now).toLowerCase()}. {snapshot?.analysis.mode === "ai" ? "AI output is validated before display." : "Local rules are deterministic and never send chat to an external service."}
      </p>
    </div>
  );
}
