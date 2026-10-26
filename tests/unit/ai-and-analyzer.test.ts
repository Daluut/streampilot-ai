import { describe, expect, it, vi } from "vitest";
import { AiAnalysisError, AnthropicAnalysisProvider, aiOutputSchema, type AiBatchMessage } from "@/lib/analysis/ai-engine";
import { analyseBatch } from "@/lib/analysis/analyzer";
import { isQuestion } from "@/lib/analysis/question-detector";
import { classifyKind } from "@/lib/analysis/message-kind";
import { DEFAULT_SETTINGS } from "@/lib/settings/schema";
import type { ChatMessage } from "@/lib/types";
import { AuthenticationError, RateLimitError } from "@anthropic-ai/sdk";

const batch = (texts: string[]): ChatMessage[] =>
  texts.map((text, i) => {
    const q = isQuestion(text);
    return {
      seq: i + 1, id: `i${i}`, source: "demo", channel: "c", username: `u${i}`, text, truncated: false,
      timestamp: "2026-10-26T10:00:00.000Z", isBroadcaster: false, isModerator: false, isQuestion: q,
      kind: classifyKind(text, q), questionGroupId: null, topicLabels: [], includedInAnalysis: false,
    };
  });

const texts = ["what sword is that?", "which sword is best", "crossbow is strong", "nice", "boss is hard", "sword or crossbow?"];

function fakeClient(response: unknown) {
  return { messages: { create: vi.fn().mockResolvedValue(response) } } as never;
}

const validInput = {
  summary: "Viewers ask about the sword.",
  insufficientContext: false,
  topics: [{ label: "sword", explanation: "Mentioned often", messageRefs: ["m1", "m2", "m99"] }],
  suggestions: [{ text: "Explain your sword choice.", basis: "Repeated question" }],
};

describe("AnthropicAnalysisProvider", () => {
  it("sends only pseudonymous refs and text, never usernames", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "tool_use", name: "report_chat_analysis", input: validInput }] });
    const provider = new AnthropicAnalysisProvider({ apiKey: "test-key", model: "claude-haiku-5-5", client: { messages: { create } } as never });
    const messages: AiBatchMessage[] = [{ ref: "m1", text: "hello", isBroadcaster: false }];
    await provider.analyse(messages);
    const body = create.mock.calls[0][0];
    const userContent = body.messages[0].content as string;
    expect(userContent).toContain("m1: hello");
    expect(userContent).not.toMatch(/username|u\d/i);
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.tool_choice).toEqual({ type: "tool", name: "report_chat_analysis" });
  });

  it("rejects malformed model output through schema validation", async () => {
    const provider = new AnthropicAnalysisProvider({ apiKey: "k", model: "m", client: fakeClient({ content: [{ type: "tool_use", name: "report_chat_analysis", input: { summary: 42 } }] }) });
    await expect(provider.analyse([{ ref: "m1", text: "x", isBroadcaster: false }])).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("reports an empty response when no tool result is present", async () => {
    const provider = new AnthropicAnalysisProvider({ apiKey: "k", model: "m", client: fakeClient({ content: [{ type: "text", text: "hi" }] }) });
    await expect(provider.analyse([{ ref: "m1", text: "x", isBroadcaster: false }])).rejects.toMatchObject({ code: "empty_response" });
  });

  it("maps authentication and rate-limit errors to understandable codes", async () => {
    const auth = new AnthropicAnalysisProvider({ apiKey: "k", model: "m", client: { messages: { create: vi.fn().mockRejectedValue(Object.assign(Object.create(AuthenticationError.prototype), { message: "401" })) } } as never });
    await expect(auth.analyse([{ ref: "m1", text: "x", isBroadcaster: false }])).rejects.toMatchObject({ code: "auth" });
    const rate = new AnthropicAnalysisProvider({ apiKey: "k", model: "m", client: { messages: { create: vi.fn().mockRejectedValue(Object.assign(Object.create(RateLimitError.prototype), { message: "429" })) } } as never });
    await expect(rate.analyse([{ ref: "m1", text: "x", isBroadcaster: false }])).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("validates the schema directly", () => {
    expect(aiOutputSchema.safeParse(validInput).success).toBe(true);
    expect(aiOutputSchema.safeParse({ ...validInput, topics: "nope" }).success).toBe(false);
  });
});

describe("analyseBatch", () => {
  it("uses AI output and drops message references that are not in the batch", async () => {
    const provider = { model: "claude-haiku-5-5", analyse: vi.fn().mockResolvedValue(validInput) };
    const { result, topicLabelsBySeq } = await analyseBatch({
      batch: batch(texts), groups: [], provider, analysisId: "a-1", now: new Date("2026-10-26T10:01:00Z"),
    });
    expect(result.mode).toBe("ai");
    expect(result.engineLabel).toBe("Claude · claude-haiku-5-5");
    expect(result.topics[0]).toMatchObject({ label: "sword", messageCount: 2, source: "ai" });
    expect(topicLabelsBySeq.get(1)).toContain("sword");
    expect(result.aiError).toBeNull();
  });

  it("falls back to local rules and reports the error when AI fails", async () => {
    const provider = { model: "m", analyse: vi.fn().mockRejectedValue(new AiAnalysisError("rate_limited", "The AI provider is rate limiting requests.")) };
    const { result } = await analyseBatch({ batch: batch(texts), groups: [], provider, analysisId: "a-2", now: new Date() });
    expect(result.mode).toBe("local");
    expect(result.engineLabel).toBe("Local rules");
    expect(result.aiError).toContain("rate limiting");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("uses local rules without calling any provider when none is configured", async () => {
    const { result } = await analyseBatch({ batch: batch(texts), groups: [], provider: null, analysisId: "a-3", now: new Date() });
    expect(result.mode).toBe("local");
    expect(result.aiError).toBeNull();
  });

  it("exposes default settings that match the documented limits", () => {
    expect(DEFAULT_SETTINGS.analysisIntervalSec).toBeGreaterThanOrEqual(15);
    expect(DEFAULT_SETTINGS.bufferSize).toBeLessThanOrEqual(2000);
  });
});
