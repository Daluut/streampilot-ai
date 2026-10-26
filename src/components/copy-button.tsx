"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/lib/client/clipboard";
import { useToast } from "./toast";

export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const onClick = async () => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.notify({ tone: "success", title: "Copied to clipboard" });
    } else {
      toast.notify({ tone: "error", title: "Copy failed", description: "Select the text and copy it manually." });
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-muted transition-colors hover:border-accent/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-strong ${className}`}
    >
      {copied ? <Check aria-hidden className="size-3.5 text-ok" /> : <Copy aria-hidden className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}
