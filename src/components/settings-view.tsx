"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Radio, SlidersHorizontal, Trash2 } from "lucide-react";
import { Badge, Banner, Button, Card, CardHeader, inputClass } from "./ui";
import { ConnectionBadge, SourceBadge } from "./status";
import { ConfirmDialog } from "./confirm-dialog";
import { DemoPanel } from "./demo-panel";
import { useSession } from "./session-provider";
import { DEMO_CHANNEL } from "@/lib/demo/script";

export function SettingsView() {
  const { snapshot, updateSettings, clearData } = useSession();
  const [bufferDraft, setBufferDraft] = useState<string | null>(null);
  const [intervalDraft, setIntervalDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!snapshot) {
    return <Card className="h-64 animate-pulse" />;
  }

  const { settings, settingsLimits: limits, integrations, connection } = snapshot;
  const bufferValue = bufferDraft ?? String(settings.bufferSize);
  const intervalValue = intervalDraft ?? String(settings.analysisIntervalSec);

  const saveNumbers = async (event: FormEvent) => {
    event.preventDefault();
    const buffer = Number(bufferValue);
    const interval = Number(intervalValue);
    const errors: string[] = [];
    if (!Number.isInteger(buffer) || buffer < limits.bufferSize.min || buffer > limits.bufferSize.max) {
      errors.push(`Buffer size must be a whole number from ${limits.bufferSize.min} to ${limits.bufferSize.max}.`);
    }
    if (!Number.isInteger(interval) || interval < limits.analysisIntervalSec.min || interval > limits.analysisIntervalSec.max) {
      errors.push(`Analysis interval must be a whole number of seconds from ${limits.analysisIntervalSec.min} to ${limits.analysisIntervalSec.max}.`);
    }
    setFormError(errors.length > 0 ? errors.join(" ") : null);
    if (errors.length > 0) return;
    setSaving(true);
    const result = await updateSettings({ bufferSize: buffer, analysisIntervalSec: interval });
    setSaving(false);
    if (result.ok) {
      setBufferDraft(null);
      setIntervalDraft(null);
    }
  };

  const toggle = async (patch: { autoAnalysis?: boolean; useAi?: boolean }) => {
    await updateSettings(patch);
  };

  const onClear = async () => {
    setClearing(true);
    await clearData();
    setClearing(false);
    setConfirmOpen(false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Twitch connection" description="How StreamPilot reads chat." action={<ConnectionBadge status={connection.status} />} />
        <dl className="divide-y divide-line/70 text-sm">
          <Row label="Current channel">{connection.channel ? `#${connection.channel}` : "None"}</Row>
          <Row label="Authentication">
            {integrations.twitchAuthMode === "token"
              ? "Server token with chat:read (configured on the server)"
              : "Anonymous read-only. No Twitch login required."}
          </Row>
          <Row label="Endpoint">{integrations.twitchIrcUrl}</Row>
          <Row label="Posting to chat">Not supported. StreamPilot never posts on your behalf.</Row>
        </dl>
        <div className="px-4 pb-4 pt-3">
          <p className="text-xs text-muted">Connect or disconnect from the Overview or Live Chat page. Only public chat for the channel you name is read.</p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="AI provider"
          description="Analysis can use an AI model or local rules."
          action={integrations.aiEnabled ? <Badge tone="accent">AI enabled</Badge> : <Badge tone="neutral">Local rules</Badge>}
        />
        <div className="space-y-4 p-4 text-sm">
          <div className="flex items-start gap-3">
            <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
            <p className="text-xs leading-relaxed text-muted">
              {integrations.aiConfigured
                ? `An API key is configured on the server (model ${integrations.aiModel}). The key is never sent to or displayed in the browser.`
                : "No AI key is configured. Analysis uses local rules, which work offline and never send chat anywhere. To enable AI, set ANTHROPIC_API_KEY in the server environment and restart."}
            </p>
          </div>
          <Toggle
            id="use-ai"
            label="Use AI when configured"
            description="When on and a key is configured, the most recent 60 messages in each analysis are sent to Anthropic with usernames removed."
            checked={settings.useAi}
            disabled={!integrations.aiConfigured}
            onChange={(checked) => toggle({ useAi: checked })}
          />
          {integrations.configError ? <Banner tone="warn" title="Configuration problem">{integrations.configError}</Banner> : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Analysis and buffer" description="Controls how much chat is kept and how often it is analysed." />
        <form noValidate onSubmit={saveNumbers} className="space-y-4 p-4">
          {formError ? <Banner tone="bad" title="Check these settings">{formError}</Banner> : null}
          <Toggle
            id="auto-analysis"
            label="Automatic analysis"
            description="Analyse new chat at the interval below while a source is active."
            checked={settings.autoAnalysis}
            onChange={(checked) => toggle({ autoAnalysis: checked })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="interval" className="mb-1 block text-xs font-medium text-muted">Analysis interval (seconds)</label>
              <input id="interval" type="number" inputMode="numeric" min={limits.analysisIntervalSec.min} max={limits.analysisIntervalSec.max} value={intervalValue} onChange={(e) => setIntervalDraft(e.target.value)} className={inputClass} />
              <p className="mt-1 text-xs text-muted">{limits.analysisIntervalSec.min}–{limits.analysisIntervalSec.max}s. Longer intervals reduce AI usage.</p>
            </div>
            <div>
              <label htmlFor="buffer" className="mb-1 block text-xs font-medium text-muted">Message buffer size</label>
              <input id="buffer" type="number" inputMode="numeric" min={limits.bufferSize.min} max={limits.bufferSize.max} value={bufferValue} onChange={(e) => setBufferDraft(e.target.value)} className={inputClass} />
              <p className="mt-1 text-xs text-muted">{limits.bufferSize.min}–{limits.bufferSize.max} messages kept in memory. Older messages are dropped.</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={saving} disabled={bufferDraft === null && intervalDraft === null}>
              <SlidersHorizontal aria-hidden className="size-4" />
              Save changes
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        <DemoPanel />
        <Card>
          <CardHeader title="Data and privacy" description="What StreamPilot keeps and where." />
          <div className="space-y-3 p-4 text-xs leading-relaxed text-muted">
            <p>Chat messages, question groups and analysis results are held <span className="text-ink/90">in server memory only</span>. Nothing is written to a database or disk, and usernames are shown only in the app.</p>
            <p>Each source reads only the buffered window: up to {settings.bufferSize} messages. Older messages are discarded automatically.</p>
            <p>Current data source: <SourceBadge snapshot={snapshot} /></p>
            <p>Demo messages come from the fictional channel <span className="text-ink/90">{DEMO_CHANNEL}</span> and are labelled as synthetic everywhere.</p>
            <div className="pt-1">
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                <Trash2 aria-hidden className="size-4" />
                Clear session data
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card className="lg:col-span-2">
        <CardHeader title="Appearance" description="Dark theme only." />
        <p className="flex items-center gap-2 p-4 text-xs text-muted"><Radio aria-hidden className="size-3.5" />StreamPilot is designed for dark, low-glare use during streams. A light theme is not offered.</p>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="Clear all session data?"
        confirmLabel="Clear data"
        busy={clearing}
        onConfirm={onClear}
        onCancel={() => setConfirmOpen(false)}
      >
        This stops the active source (live chat or demo), removes all buffered messages, question states and analysis history from this session. It cannot be undone. Your channel and settings are kept.
      </ConfirmDialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink/90">{children}</dd>
    </div>
  );
}

function Toggle({
  id,
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className={`text-sm font-medium ${disabled ? "text-muted" : "text-ink"}`}>{label}</label>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong disabled:opacity-40 ${checked ? "bg-accent" : "bg-raised border border-line"}`}
      >
        <span aria-hidden className={`inline-block size-3.5 rounded-full bg-white transition-transform duration-150 ${checked ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
