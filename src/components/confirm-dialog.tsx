"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./ui";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation for destructive actions. Escape and the backdrop cancel it. */
export function ConfirmDialog({ open, title, children, confirmLabel, busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-lg border border-line bg-panel p-5 shadow-2xl shadow-black/60">
        <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
