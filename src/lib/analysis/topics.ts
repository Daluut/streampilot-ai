import type { TopicCluster } from "@/lib/types";
import { contentTokens, jaccard } from "./text";

export const MIN_MESSAGES_FOR_TOPICS = 5;
const MIN_DOCUMENT_FREQUENCY = 3;
const MAX_CANDIDATES = 8;
const DUPLICATE_OVERLAP = 0.6;

export interface TopicMessage {
  seq: number;
  text: string;
  timestamp: string;
}

/**
 * Finds recurring terms in a batch of real messages. A term becomes a topic when it
 * appears in at least a few messages (and at least 5% of the batch). Topics that
 * cover almost exactly the same messages are merged into the first one found.
 * Counts are exact: they are the number of messages containing the term.
 */
export function detectTopics(messages: readonly TopicMessage[], maxTopics = 5): TopicCluster[] {
  if (messages.length < MIN_MESSAGES_FOR_TOPICS) return [];

  const membership = new Map<string, number[]>();
  messages.forEach((message, index) => {
    for (const token of contentTokens(message.text)) {
      const list = membership.get(token);
      if (list) list.push(index);
      else membership.set(token, [index]);
    }
  });

  const minDocumentFrequency = Math.max(MIN_DOCUMENT_FREQUENCY, Math.ceil(messages.length * 0.05));
  const candidates = [...membership.entries()]
    .filter(([, indexes]) => indexes.length >= minDocumentFrequency)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, MAX_CANDIDATES);

  const selected: { label: string; indexes: number[] }[] = [];
  for (const [label, indexes] of candidates) {
    const isDuplicate = selected.some(
      (topic) => jaccard(topic.indexes.map(String), indexes.map(String)) >= DUPLICATE_OVERLAP,
    );
    if (!isDuplicate) selected.push({ label, indexes });
    if (selected.length >= maxTopics) break;
  }

  return selected.map(({ label, indexes }) => {
    const latest = indexes[indexes.length - 1];
    return {
      label,
      explanation: `Appears in ${indexes.length} of the last ${messages.length} messages.`,
      messageCount: indexes.length,
      latestAt: messages[latest].timestamp,
      sampleSeqs: indexes.slice(-3).map((index) => messages[index].seq),
      source: "local" as const,
    };
  });
}
