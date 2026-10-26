import { describe, expect, it } from "vitest";
import { SessionStore } from "@/lib/state/session-store";
import { MAX_QUESTION_GROUPS } from "@/lib/analysis/question-groups";

const base = {
  source: "twitch" as const, channel: "chan", timestamp: "2026-10-26T10:00:00.000Z",
  isBroadcaster: false, isModerator: false,
};

describe("SessionStore", () => {
  it("drops duplicate message ids", () => {
    const store = new SessionStore();
    store.ingest({ ...base, id: "m1", username: "a", text: "hello" });
    const second = store.ingest({ ...base, id: "m1", username: "a", text: "hello" });
    expect(second).toEqual({ accepted: false, reason: "duplicate" });
    expect(store.messages).toHaveLength(1);
    expect(store.metrics().duplicatesDropped).toBe(1);
  });
  it("ignores messages that are empty after sanitising", () => {
    const store = new SessionStore();
    expect(store.ingest({ ...base, id: null, username: "a", text: "   \u0001 " })).toEqual({ accepted: false, reason: "empty" });
  });
  it("keeps the message buffer within the configured size", () => {
    const store = new SessionStore();
    store.updateSettings({ bufferSize: 100 });
    for (let i = 0; i < 250; i += 1) {
      store.ingest({ ...base, id: `m${i}`, username: `u${i % 9}`, text: `message number ${i}` });
    }
    expect(store.messages).toHaveLength(100);
    expect(store.messages[0].seq).toBe(151);
    expect(store.metrics().messagesReceived).toBe(250);
  });
  it("bounds question groups", () => {
    const store = new SessionStore();
    for (let i = 0; i < MAX_QUESTION_GROUPS + 20; i += 1) {
      store.ingest({ ...base, id: `q${i}`, username: "a", text: `unique${i} zebra${i} question${i}?` });
    }
    expect(store.groups.length).toBeLessThanOrEqual(MAX_QUESTION_GROUPS);
  });
  it("tracks handled status and reopening", () => {
    const store = new SessionStore();
    store.ingest({ ...base, id: "q1", username: "a", text: "which weapon are you using?" });
    const id = store.groups[0].id;
    expect(store.setQuestionStatus(id, "handled")?.status).toBe("handled");
    expect(store.groups[0].handledAt).not.toBeNull();
    expect(store.setQuestionStatus(id, "open")?.handledAt).toBeNull();
    expect(store.setQuestionStatus("q-999", "handled")).toBeNull();
  });
  it("clears session data and bumps the epoch", () => {
    const store = new SessionStore();
    store.ingest({ ...base, id: "x", username: "a", text: "hello there" });
    const epoch = store.epoch;
    store.clearData();
    expect(store.messages).toHaveLength(0);
    expect(store.groups).toHaveLength(0);
    expect(store.epoch).toBe(epoch + 1);
    expect(store.metrics().uniqueChatters).toBe(0);
  });
  it("returns only messages after a cursor", () => {
    const store = new SessionStore();
    for (let i = 0; i < 5; i += 1) store.ingest({ ...base, id: `c${i}`, username: "a", text: `msg ${i}` });
    expect(store.messagesAfter(3).map((m) => m.seq)).toEqual([4, 5]);
    expect(store.messagesAfter(0)).toHaveLength(5);
  });
  it("rejects nothing it cannot store: clamps settings to limits", () => {
    const store = new SessionStore();
    expect(store.updateSettings({ bufferSize: 1_000_000, analysisIntervalSec: 1 })).toMatchObject({
      bufferSize: 2000,
      analysisIntervalSec: 15,
    });
  });
});
