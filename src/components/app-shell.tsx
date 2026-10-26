"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ListChecks, LayoutDashboard, MessagesSquare, Settings, Sparkles } from "lucide-react";
import { AnalysisModeBadge, ConnectionBadge, SourceBadge } from "./status";
import { SessionProvider, useNow, useSession } from "./session-provider";
import { ToastProvider } from "./toast";
import { Badge } from "./ui";
import { formatRelative, formatCountdown } from "@/lib/client/format";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/chat", label: "Live Chat", icon: MessagesSquare },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/questions", label: "Question Queue", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ToastProvider>
      <SessionProvider>
        <div className="flex min-h-dvh flex-col md:flex-row">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <PageHeader title={headerTitleFor(pathname)} />
            <main id="main" className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6">
              {children}
            </main>
          </div>
        </div>
      </SessionProvider>
    </ToastProvider>
  );
}

function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="border-b border-line bg-panel md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:block md:px-5 md:py-5">
        <Link href="/overview" className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-accent-strong">
          <span aria-hidden className="grid size-8 place-items-center rounded-md bg-accent text-sm font-bold text-white">SP</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">StreamPilot AI</span>
            <span className="hidden text-[11px] leading-tight text-muted md:block">Understand your chat. Focus on your stream.</span>
          </span>
        </Link>
        <div className="md:hidden">
          <SidebarConnection />
        </div>
      </div>

      <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent-strong ${
                active ? "bg-accent/15 text-ink" : "text-muted hover:bg-raised hover:text-ink"
              }`}
            >
              <Icon aria-hidden className={`size-4 ${active ? "text-accent-strong" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="hidden px-5 pt-6 md:block">
        <p className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">Connection</p>
        <SidebarConnection />
        <p className="mt-6 text-xs leading-relaxed text-muted">
          Read-only. StreamPilot never posts to Twitch on your behalf.
        </p>
      </div>
    </aside>
  );
}

/** Demo data has no Twitch connection, so the sidebar says so rather than showing "Disconnected". */
function SidebarConnection() {
  const { snapshot, syncError } = useSession();
  if (syncError) return <ConnectionBadge status="error" />;
  if (snapshot?.source === "demo") return <Badge tone="demo">Demo · no Twitch connection</Badge>;
  return <ConnectionBadge status={snapshot?.connection.status ?? "disconnected"} />;
}

export function PageHeader({ title }: { title: string }) {
  const { snapshot } = useSession();
  const now = useNow();
  const lastAt = snapshot?.analysis.lastAt ?? null;
  const nextIn = snapshot?.analysis.nextAt ? formatCountdown(snapshot.analysis.nextAt, now) : null;

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-canvas/80 px-4 py-3 backdrop-blur md:px-6">
      <p className="mr-auto min-w-0 truncate text-base font-semibold text-ink">{title}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <SourceBadge snapshot={snapshot} />
        {snapshot?.source === "live" ? <ConnectionBadge status={snapshot.connection.status} /> : null}
        <AnalysisModeBadge snapshot={snapshot} />
        <Badge tone="neutral">
          Last analysis: {formatRelative(lastAt, now)}
          {nextIn && snapshot?.analysis.nextAt ? ` · next ${nextIn}` : ""}
        </Badge>
      </div>
      <Link
        href="/settings"
        aria-label="Open settings"
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-strong"
      >
        <Settings aria-hidden className="size-3.5" />
        Settings
      </Link>
    </header>
  );
}

export function headerTitleFor(pathname: string): string {
  return NAV.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ?? "StreamPilot AI";
}
