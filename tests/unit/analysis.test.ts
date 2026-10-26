import { describe, expect, it } from "vitest";
import { isQuestion } from "@/lib/analysis/question-detector";
import { addQuestionToGroups, isSameQuestion, markResponses } from "@/lib/analysis/question-groups";
import { classifySentiment, summariseSentiment } from "@/lib/analysis/sentiment";
import { detectTopics } from "@/lib/analysis/topics";
import { analyseLocally } from "@/lib/analysis/local-engine";
import { sanitizeMessageText, contentTokens, MAX_MESSAGE_LENGTH } from "@/lib/analysis/text";
import { classifyKind } from "@/lib/analysis/message-kind";
import type { ChatMessage, QuestionGroup } from "@/lib/types";

const ts = "2026-10-26T10:00:00.000Z";

function msg(seq: number, text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  const question = isQuestion(text);
  return {
    seq, id: `id-${seq}`, source: "twitch", channel: "chan", username: `user${seq % 7}`, text,
    truncated: false, timestamp: ts, isBroadcaster: false, isModerator: false,
    isQuestion: question, kind: classifyKind(text, question), questionGroupId: null, topicLabels: [],
    includedInAnalysis: false, ...extra,
  };
}

describe("question detection", () => {
  it("detects question marks and question openers", () => {
    expect(isQuestion("what weapon are you using?")).toBe(true);
    expect(isQuestion("which sword is that")).toBe(true);
    expect(isQuestion("anyone know the build")).toBe(true);
  });
  it("does not treat ordinary statements as questions", () => {
    expect(isQuestion("nice shot")).toBe(false);
    expect(isQuestion("lol")).toBe(false);
  });
  it("ignores a lone punctuation mark", () => {
    expect(isQuestion("???")).toBe(false);
  });
});

describe("question grouping", () => {
  it("groups differently worded versions of the same question", () => {
    const groups: QuestionGroup[] = [];
    let n = 0;
    const next = () => `q-${++n}`;
    const asks = [
      "what weapon are you using rn?",
      "which weapon do you use",
      "whats the weapon in ur hand",
    ];
    asks.forEach((text, i) => {
      addQuestionToGroups(groups, { seq: i + 1, username: `v${i}`, text, timestamp: ts, tokens: contentTokens(text) }, next);
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].uniqueAskers).toBe(3);
    expect(groups[0].examples.length).toBeLessThanOrEqual(3);
  });
  it("keeps unrelated questions in separate groups", () => {
    const groups: QuestionGroup[] = [];
    let n = 0;
    const next = () => `q-${++n}`;
    for (const [i, text] of ["what weapon are you using?", "is phase two coming soon?"].entries()) {
      addQuestionToGroups(groups, { seq: i, username: "x", text, timestamp: ts, tokens: contentTokens(text) }, next);
    }
    expect(groups).toHaveLength(2);
    expect(isSameQuestion(contentTokens("what weapon"), contentTokens("phase two soon"))).toBe(false);
  });
  it("marks a question as responded only when a broadcaster reply shares content words", () => {
    const groups: QuestionGroup[] = [];
    addQuestionToGroups(groups, { seq: 1, username: "a", text: "what weapon?", timestamp: ts, tokens: contentTokens("what weapon?") }, () => "q-1");
    expect(markResponses(groups, { seq: 2, tokens: contentTokens("gear and sounds") })).toBe(0);
    expect(groups[0].responseDetected).toBe(false);
    expect(markResponses(groups, { seq: 3, tokens: contentTokens("the weapon is a sword") })).toBe(1);
    expect(groups[0].responseDetected).toBe(true);
  });
});

describe("sentiment", () => {
  it("classifies clear positive and negative messages", () => {
    expect(classifySentiment("that was clean gg")).toBe("positive");
    expect(classifySentiment("this boss is so unfair")).toBe("negative");
  });
  it("respects simple negation", () => {
    expect(classifySentiment("not bad honestly")).toBe("positive");
  });
  it("reports mixed cues as ambiguous and counts them as neutral", () => {
    expect(classifySentiment("awful boss but great music")).toBe("ambiguous");
    const overview = summariseSentiment(["awful boss but great music", "nice", "hate this"]);
    expect(overview).toEqual({ positive: 1, negative: 1, neutral: 1, ambiguous: 1, total: 3 });
  });
  it("handles empty input as neutral", () => {
    expect(classifySentiment("")).toBe("neutral");
  });
});

describe("topics", () => {
  it("returns no topics for fewer than five messages", () => {
    expect(detectTopics([{ seq: 1, text: "crossbow crossbow", timestamp: ts }])).toEqual([]);
  });
  it("counts exact message occurrences of recurring terms", () => {
    const texts = [
      "crossbow is strong", "the crossbow again", "crossbow > sword", "sword is fine",
      "lol that boss", "boss music is great", "boss phase next",
    ];
    const topics = detectTopics(texts.map((text, i) => ({ seq: i + 1, text, timestamp: ts })));
    const crossbow = topics.find((t) => t.label === "crossbow");
    expect(crossbow?.messageCount).toBe(3);
    expect(crossbow?.explanation).toContain("Appears in 3 of the last 7 messages");
    expect(topics.find((t) => t.label === "boss")?.messageCount).toBe(3);
  });
});

describe("sanitising and special characters", () => {
  it("removes control characters and collapses whitespace", () => {
    expect(sanitizeMessageText("hi\u0007   there\n\nfriend").text).toBe("hi there friend");
  });
  it("truncates very long messages and flags them", () => {
    const result = sanitizeMessageText("x".repeat(MAX_MESSAGE_LENGTH + 50));
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(MAX_MESSAGE_LENGTH);
  });
  it("keeps emoji and non-latin text as searchable content", () => {
    expect(contentTokens("ça va 🎮 ゲーム")).toContain("ça");
  });
});

describe("local analysis engine", () => {
  it("returns a 'not enough chat' summary for an empty batch", () => {
    const result = analyseLocally({ batch: [], groups: [], idPrefix: "a-1" });
    expect(result.summary).toMatch(/Not enough chat/);
    expect(result.topics).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });
  it("produces grounded suggestions for repeated unanswered questions", () => {
    const batch = [
      msg(1, "what weapon are you using?"),
      msg(2, "which weapon do you use"),
      msg(3, "whats the weapon in ur hand"),
      msg(4, "nice shot"),
      msg(5, "lol"),
    ];
    const groups: QuestionGroup[] = [];
    let n = 0;
    for (const m of batch.filter((b) => b.isQuestion)) {
      addQuestionToGroups(groups, { seq: m.seq, username: m.username, text: m.text, timestamp: ts, tokens: contentTokens(m.text) }, () => `q-${++n}`);
    }
    const result = analyseLocally({ batch, groups, idPrefix: "a-1" });
    expect(result.suggestions[0].text).toContain("3 messages ask");
    expect(result.suggestions[0].text).toContain("No response detected in the available chat window.");
    expect(result.summary).toContain("3 messages look like a question");
  });
  it("never invents a suggestion when nothing repeats", () => {
    const batch = [msg(1, "hello"), msg(2, "good morning"), msg(3, "first time here"), msg(4, "hi all"), msg(5, "yo")];
    const result = analyseLocally({ batch, groups: [], idPrefix: "a-2" });
    expect(result.suggestions).toEqual([]);
  });
});
