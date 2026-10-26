"use client";

import { useState, type FormEvent } from "react";
import { Radio, Wifi } from "lucide-react";
import { Banner, Button, Card, CardHeader, inputClass } from "./ui";
import { ConnectionBadge } from "./status";
import { useNow, useSession } from "./session-provider";
import { formatCountdown } from "@/lib/client/format";
import { parseChannelName } from "@/lib/twitch/channel";

export function ConnectPanel() {
  const { snapshot, connect, disconnect } = useSession();
  const now = useNow();
  const [channel, setChannel] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!snapshot) {
    return (
      <Card className="p-4">
        <div className="h-24 animate-pulse rounded-md bg-raised" aria-label="Loading connection status" />
      </Card>
    );
  }

  const { connection, integrations } = snapshot;
  const isActive = connection.status === "connecting" || connection.status === "connected" || connection.status === "reconnecting";
  const retryText = formatCountdown(connection.nextRetryAt, now);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseChannelName(channel);
    if (!parsed.ok) {
      setLocalError(parsed.reason);
      return;
    }
    setLocalError(null);
    setBusy(true);
    await connect(parsed.channel);
    setBusy(false);
  };

  const onDisconnect = async () => {
    setBusy(true);
    await disconnect();
    setBusy(false);
  };

  const description = {
    disconnected: connection.channel
      ? `Not connected. Messages from #${connection.channel} stay visible until you clear the session.`
      : "Enter a channel to read its public chat.",
    connecting: `Opening chat for #${connection.channel}. Waiting for Twitch to confirm the join.`,
    connected: `Receiving chat from #${connection.channel}. Read-only: StreamPilot never posts to Twitch.`,
    reconnecting: `Connection interrupted. Reconnecting to #${connection.channel}${retryText ? ` ${retryText}` : ""} (attempt ${connection.attempt}).`,
    error: "The connection stopped. See the message below.",
  }[connection.status];

  return (
    <Card>
      <CardHeader
        title="Twitch chat connection"
        description="Reads public chat over Twitch IRC. No Twitch login is needed by default."
        action={<ConnectionBadge status={connection.status} />}
      />
      <div className="space-y-3 p-4">
        <p className="text-sm text-ink/90">{description}</p>

        {connection.status === "error" && connection.error ? (
          <Banner tone="bad" title="Connection failed">{connection.error}</Banner>
        ) : null}
        {connection.status === "reconnecting" && connection.error ? (
          <Banner tone="warn" title="Connection interrupted">{connection.error}</Banner>
        ) : null}
        {integrations.configError ? (
          <Banner tone="warn" title="Server configuration needs attention">{integrations.configError}</Banner>
        ) : null}

        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <label htmlFor="channel-input" className="mb-1 block text-xs font-medium text-muted">Channel name</label>
            <input
              id="channel-input"
              name="channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder={connection.channel ?? "your_channel"}
              autoComplete="off"
              spellCheck={false}
              disabled={isActive}
              aria-invalid={localError ? true : undefined}
              aria-describedby={localError ? "channel-error" : "channel-help"}
              className={inputClass}
            />
            {localError ? (
              <p id="channel-error" className="mt-1 text-xs text-red-300">{localError}</p>
            ) : (
              <p id="channel-help" className="mt-1 text-xs text-muted">Letters, numbers and underscores. Example: the name in the channel URL.</p>
            )}
          </div>
          <div className="flex gap-2 sm:pt-5">
            {isActive ? (
              <Button variant="secondary" onClick={onDisconnect} loading={busy} className="flex-1 sm:flex-none">
                <Wifi aria-hidden className="size-4" />
                Disconnect
              </Button>
            ) : (
              <Button type="submit" variant="primary" loading={busy} className="flex-1 sm:flex-none" disabled={channel.trim().length === 0}>
                <Radio aria-hidden className="size-4" />
                Connect
              </Button>
            )}
          </div>
        </form>

        <p className="text-xs text-muted">
          {integrations.twitchAuthMode === "token"
            ? "Authenticated with the server's chat token (chat:read). The token is never shown in the browser."
            : "Anonymous read-only connection. No credentials are sent from your browser."}
        </p>
      </div>
    </Card>
  );
}
