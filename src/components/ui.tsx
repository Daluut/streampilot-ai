import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";

type Tone = "neutral" | "accent" | "live" | "demo" | "ok" | "warn" | "bad" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-line bg-raised text-muted",
  accent: "border-accent/40 bg-accent/15 text-accent-strong",
  live: "border-live/40 bg-live/15 text-rose-300",
  demo: "border-demo/40 bg-demo/15 text-amber-300",
  ok: "border-ok/40 bg-ok/15 text-emerald-300",
  warn: "border-warn/40 bg-warn/15 text-amber-200",
  bad: "border-bad/40 bg-bad/15 text-red-300",
  info: "border-sky-400/30 bg-sky-400/10 text-sky-200",
};

export function Badge({ tone = "neutral", children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function Card({ children, className = "", as: Tag = "section" }: { children?: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <Tag className={`rounded-lg border border-line bg-panel ${className}`}>{children}</Tag>;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong/90 disabled:bg-accent/40",
  secondary: "border border-line bg-raised text-ink hover:border-accent/60 disabled:text-muted",
  ghost: "text-muted hover:bg-raised hover:text-ink disabled:text-muted/50",
  danger: "border border-bad/40 bg-bad/10 text-red-300 hover:bg-bad/20 disabled:opacity-50",
};

export function Button({
  variant = "secondary",
  loading = false,
  className = "",
  children,
  disabled,
  ref,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong disabled:cursor-not-allowed ${BUTTON_CLASSES[variant]} ${className}`}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="mb-1 text-muted">{icon}</div> : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {children ? <div className="max-w-md text-xs leading-relaxed text-muted">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Banner({ tone, title, children }: { tone: "info" | "warn" | "bad" | "ok"; title?: string; children?: ReactNode }) {
  const styles = {
    info: "border-sky-400/30 bg-sky-400/10 text-sky-100",
    warn: "border-warn/40 bg-warn/10 text-amber-100",
    bad: "border-bad/40 bg-bad/10 text-red-100",
    ok: "border-ok/40 bg-ok/10 text-emerald-100",
  }[tone];
  const Icon = tone === "ok" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${styles}`}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-xs leading-relaxed opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}

export function PageHeading({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-ink md:text-xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-strong disabled:opacity-50";
