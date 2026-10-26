"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiRequest, type ActionResult } from "@/lib/client/api";
import type { SessionSnapshot } from "@/lib/runtime-types";
import type { ChatMessage, SessionSettings } from "@/lib/types";
import { useToast } from "./toast";

const POLL_INTERVAL_MS = 1000;

interface SessionContextValue {
  snapshot: SessionSnapshot | null;
  /** Client copy of the server's message buffer, kept in order and bounded by the buffer size. */
  messages: ChatMessage[];
  syncError: string | null;
  connect: (channel: string) => Promise<ActionResult>;
  disconnect: () => Promise<ActionResult>;
  demo: (action: "start" | "pause" | "resume" | "reset") => Promise<ActionResult>;
  analyse: () => Promise<ActionResult>;
  setQuestionStatus: (id: string, status: "open" | "handled") => Promise<ActionResult>;
  updateSettings: (patch: Partial<SessionSettings>) => Promise<ActionResult>;
  clearData: () => Promise<ActionResult>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const cursorRef = useRef(0);
  const epochRef = useRef<number | null>(null);

  const poll = useCallback(async () => {
    const result = await apiRequest<SessionSnapshot>(`/api/session?after=${cursorRef.current}`);
    if (!result.ok) {
      setSyncError(result.message);
      return;
    }
    setSyncError(null);
    const data = result.data;
    setSnapshot(data);

    if (epochRef.current !== null && epochRef.current !== data.epoch) {
      // Session was cleared on the server: drop the local copy and refetch from the start.
      epochRef.current = data.epoch;
      cursorRef.current = 0;
      setMessages([]);
      return;
    }
    epochRef.current = data.epoch;
    cursorRef.current = data.latestSeq;
    if (data.messages.length > 0) {
      setMessages((previous) => {
        const merged = previous.concat(data.messages);
        const limit = data.settings.bufferSize;
        return merged.length > limit ? merged.slice(merged.length - limit) : merged;
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      await poll();
      if (!cancelled) timer = setTimeout(loop, POLL_INTERVAL_MS);
    };
    void loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [poll]);

  const afterAction = useCallback(
    async (result: ActionResult, successMessage?: string): Promise<ActionResult> => {
      await poll();
      if (result.ok) {
        if (successMessage) toast.notify({ tone: "success", title: successMessage });
      } else {
        toast.notify({ tone: "error", title: result.message });
      }
      return result;
    },
    [poll, toast],
  );

  const post = useCallback(
    async (path: string, body: unknown, successMessage?: string, method: "POST" | "PATCH" = "POST"): Promise<ActionResult> => {
      const result = await apiRequest(path, { method, body });
      const outcome: ActionResult = result.ok ? { ok: true } : { ok: false, message: result.message };
      return afterAction(outcome, successMessage);
    },
    [afterAction],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      snapshot,
      messages,
      syncError,
      connect: (channel) => post("/api/connection", { action: "connect", channel }, `Connecting to #${channel}`),
      disconnect: () => post("/api/connection", { action: "disconnect" }, "Disconnected from Twitch chat"),
      demo: (action) => {
        const labels = { start: "Demo started", pause: "Demo paused", resume: "Demo resumed", reset: "Demo reset and session cleared" };
        return post("/api/demo", { action }, labels[action]);
      },
      analyse: async () => {
        const result = await apiRequest<{ mode?: string; aiError?: string | null }>("/api/analysis", { method: "POST" });
        await poll();
        if (!result.ok) {
          toast.notify({ tone: "error", title: result.message });
          return { ok: false, message: result.message };
        }
        if (result.data.aiError) {
          toast.notify({ tone: "warning", title: "AI analysis unavailable, showing local rules", description: result.data.aiError });
        } else {
          toast.notify({ tone: "success", title: "Analysis updated" });
        }
        return { ok: true };
      },
      setQuestionStatus: (id, status) =>
        post(`/api/questions/${id}`, { status }, status === "handled" ? "Marked as handled" : "Question reopened", "PATCH"),
      updateSettings: (patch) => post("/api/settings", patch, "Settings saved", "PATCH"),
      clearData: () => post("/api/data/clear", { confirm: true }, "Session data cleared"),
    }),
    [snapshot, messages, syncError, post, poll, toast],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}

/** Re-renders every second so relative times stay current without polling the server. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
