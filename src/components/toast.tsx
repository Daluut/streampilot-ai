"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type Tone = "success" | "error" | "warning" | "info";
interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  notify: (toast: { tone: Tone; title: string; description?: string }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (toast: { tone: Tone; title: string; description?: string }) => {
      counter.current += 1;
      const id = counter.current;
      setItems((current) => [...current.slice(-3), { id, ...toast }]);
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2">
        {items.map((item) => {
          const Icon = item.tone === "success" ? CheckCircle2 : item.tone === "error" || item.tone === "warning" ? AlertTriangle : Info;
          const color = {
            success: "text-ok",
            error: "text-bad",
            warning: "text-warn",
            info: "text-sky-300",
          }[item.tone];
          return (
            <div key={item.id} role={item.tone === "error" ? "alert" : "status"} className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-raised px-3 py-2.5 shadow-lg shadow-black/40 animate-[toast-in_180ms_ease-out]">
              <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${color}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">{item.title}</p>
                {item.description ? <p className="mt-0.5 text-xs text-muted">{item.description}</p> : null}
              </div>
              <button type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss notification" className="rounded p-0.5 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-strong">
                <X aria-hidden className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
