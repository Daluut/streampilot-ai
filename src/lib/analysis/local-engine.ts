import type { ChatMessage, QuestionGroup, SentimentOverview, Suggestion, TopicCluster, MessageKind } from "@/lib/types";
import { EMPTY_KIND_COUNTS } from "./message-kind";
import { summariseSentiment } from "./sentiment";
import { MIN_MESSAGES_FOR_TOPICS, detectTopics } from "./topics";

export const MIN_MESSAGES_FOR_SUMMARY = MIN_MESSAGES_FOR_TOPICS;

export interface LocalAnalysis {
  summary: string;
  topics: TopicCluster[];
  sentiment: SentimentOverview;
  messageKinds: Record<MessageKind, number>;
  suggestions: Suggestion[];
  /** Topic labels per message seq, used to tag messages in the chat view. */
  topicLabelsBySeq: Map<number, string[]>;
}

export interface LocalAnalysisInput {
  batch: readonly ChatMessage[];
  groups: readonly QuestionGroup[];
  idPrefix: string;
}

/**
 * Deterministic analysis that works without any external service. Every number
 * and sentence is derived from the batch passed in. When there is not enough
 * chat to say anything useful, the result says so instead of inventing content.
 */
export function analyseLocally({ batch, groups, idPrefix }: LocalAnalysisInput): LocalAnalysis {
  const messageKinds = { ...EMPTY_KIND_COUNTS };
  for (const message of batch) messageKinds[message.kind] += 1;

  const sentiment = summariseSentiment(batch.map((m) => m.text));
  const topics = detectTopics(batch);
  const topicLabelsBySeq = new Map<number, string[]>();
  for (const topic of topics) {
    for (const message of batch) {
      if (topicMatches(topic.label, message.text)) {
        const labels = topicLabelsBySeq.get(message.seq) ?? [];
        labels.push(topic.label);
        topicLabelsBySeq.set(message.seq, labels);
      }
    }
  }

  const batchFirstSeq = batch[0]?.seq ?? 0;
  const groupsInBatch = groups
    .filter((group) => group.latestSeq >= batchFirstSeq)
    .sort((a, b) => b.count - a.count);

  const summary = buildSummary({ batch, topics, messageKinds, sentiment, groupsInBatch });
  const suggestions = buildSuggestions({ batch, groupsInBatch, messageKinds, sentiment, topics, idPrefix });

  return { summary, topics, sentiment, messageKinds, suggestions, topicLabelsBySeq };
}

function topicMatches(label: string, text: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(label)}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSummary(input: {
  batch: readonly ChatMessage[];
  topics: TopicCluster[];
  messageKinds: Record<MessageKind, number>;
  sentiment: SentimentOverview;
  groupsInBatch: QuestionGroup[];
}): string {
  const { batch, topics, messageKinds, sentiment, groupsInBatch } = input;
  if (batch.length < MIN_MESSAGES_FOR_SUMMARY) {
    return `Not enough chat to summarise yet (${batch.length} message${batch.length === 1 ? "" : "s"}). A summary appears after ${MIN_MESSAGES_FOR_SUMMARY} messages.`;
  }

  const parts: string[] = [];
  if (topics.length > 0) {
    const named = topics.slice(0, 3).map((t) => `"${t.label}" (${t.messageCount} messages)`);
    parts.push(`The most repeated terms in this window are ${joinList(named)}.`);
  } else {
    parts.push(`No term repeats often enough in this window to count as a topic yet.`);
  }

  const questionCount = messageKinds.question;
  if (questionCount > 0) {
    const largest = groupsInBatch[0];
    const groupNote =
      largest && largest.count > 1
        ? ` The largest repeated question is "${largest.canonical}" (${largest.count} messages).`
        : "";
    parts.push(`${questionCount} message${questionCount === 1 ? " looks" : "s look"} like a question.${groupNote}`);
  }

  if (messageKinds.technical > 0) {
    parts.push(`${messageKinds.technical} message${messageKinds.technical === 1 ? " reports" : "s report"} a technical problem.`);
  }

  const { positive, negative, neutral } = sentiment;
  parts.push(`Keyword tone: ${positive} positive, ${negative} negative, ${neutral} neutral or unclear.`);

  const broadcasterReplies = batch.filter((m) => m.isBroadcaster).length;
  if (broadcasterReplies > 0) {
    parts.push(`The broadcaster posted ${broadcasterReplies} message${broadcasterReplies === 1 ? "" : "s"} in this window.`);
  }

  return parts.join(" ");
}

function buildSuggestions(input: {
  batch: readonly ChatMessage[];
  groupsInBatch: QuestionGroup[];
  messageKinds: Record<MessageKind, number>;
  sentiment: SentimentOverview;
  topics: TopicCluster[];
  idPrefix: string;
}): Suggestion[] {
  const { batch, groupsInBatch, messageKinds, sentiment, topics, idPrefix } = input;
  const suggestions: Suggestion[] = [];
  let counter = 0;
  const add = (text: string, basis: string) => {
    counter += 1;
    suggestions.push({ id: `${idPrefix}-s${counter}`, text, basis });
  };

  for (const group of groupsInBatch.filter((g) => g.count >= 2 && g.status === "open").slice(0, 3)) {
    const response = group.responseDetected
      ? "A reply with overlapping wording is visible in chat."
      : "No response detected in the available chat window.";
    add(
      `${group.count} messages ask "${group.canonical}". ${response} Consider answering it in chat or during a break.`,
      `Repeated question · ${group.count} messages`,
    );
  }

  const negativeThreshold = Math.max(3, Math.ceil(batch.length * 0.25));
  if (sentiment.negative >= negativeThreshold) {
    add(
      `${sentiment.negative} messages in this window read as negative or frustrated. Consider acknowledging the difficulty or explaining what you are trying next.`,
      `Keyword tone · ${sentiment.negative} negative messages`,
    );
  }

  if (messageKinds.technical >= 2) {
    add(
      `${messageKinds.technical} messages report technical problems. Check stream health and audio levels, and tell chat if you have found the cause.`,
      `Technical reports · ${messageKinds.technical} messages`,
    );
  }

  if (messageKinds.suggestion >= 3) {
    add(
      `${messageKinds.suggestion} messages offer suggestions. Pick one to try and tell chat what you chose and why.`,
      `Suggestions · ${messageKinds.suggestion} messages`,
    );
  }

  if (suggestions.length === 0 && topics.length > 0) {
    add(
      `Chat is most active on "${topics[0].label}". No repeated questions or problems were detected in this window.`,
      `Topic activity · ${topics[0].messageCount} messages`,
    );
  }

  return suggestions.slice(0, 5);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
