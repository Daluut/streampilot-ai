import type { QuestionExample, QuestionGroup } from "@/lib/types";
import { jaccard, sharedCount } from "./text";

export const MAX_QUESTION_GROUPS = 100;
export const RESPONSE_WINDOW_MESSAGES = 60;
const EXAMPLE_LIMIT = 3;

/**
 * Two questions are treated as the same when their content words overlap. Either the
 * Jaccard similarity is high, or most of the shorter question's content words are shared.
 * Very short questions (one or two content words) only need one shared word that covers
 * at least half of them, so "which weapon" and "whats the weapon in ur hand" still group.
 */
export function isSameQuestion(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  if (jaccard(a, b) >= 0.34) return true;
  const shared = sharedCount(a, b);
  const overlap = shared / Math.min(new Set(a).size, new Set(b).size);
  return (shared >= 2 && overlap >= 0.6) || (shared >= 1 && overlap >= 0.5 && Math.min(a.length, b.length) <= 2);
}

export interface QuestionInput {
  seq: number;
  username: string;
  text: string;
  timestamp: string;
  tokens: string[];
}

/**
 * Adds a question to the best matching group, or creates a new group.
 * Groups are mutated in place. Returns the group the question belongs to.
 */
export function addQuestionToGroups(
  groups: QuestionGroup[],
  question: QuestionInput,
  nextId: () => string,
): { group: QuestionGroup; created: boolean } {
  let best: QuestionGroup | undefined;
  let bestScore = 0;
  for (const group of groups) {
    if (!isSameQuestion(group.tokens, question.tokens)) continue;
    const score = jaccard(group.tokens, question.tokens);
    if (!best || score > bestScore) {
      best = group;
      bestScore = score;
    }
  }

  if (best) {
    best.count += 1;
    best.latestAt = question.timestamp;
    best.latestSeq = question.seq;
    addExample(best, question);
    best.uniqueAskers = countUniqueAskers(best, question.username);
    return { group: best, created: false };
  }

  const group: QuestionGroup = {
    id: nextId(),
    canonical: question.text.slice(0, 200),
    count: 1,
    uniqueAskers: 1,
    examples: [toExample(question)],
    firstSeenAt: question.timestamp,
    latestAt: question.timestamp,
    latestSeq: question.seq,
    status: "open",
    handledAt: null,
    responseDetected: false,
    tokens: [...new Set(question.tokens)],
  };
  groups.push(group);
  trimQuestionGroups(groups);
  return { group, created: true };
}

function toExample(question: QuestionInput): QuestionExample {
  return {
    seq: question.seq,
    username: question.username,
    text: question.text,
    timestamp: question.timestamp,
  };
}

/** Keeps up to three examples, preferring one per asker, always including the latest. */
function addExample(group: QuestionGroup, question: QuestionInput): void {
  const example = toExample(question);
  const alreadyFromAsker = group.examples.some((e) => e.username === question.username);
  if (group.examples.length < EXAMPLE_LIMIT) {
    if (!alreadyFromAsker || group.examples.length < 2) {
      group.examples.push(example);
    }
    return;
  }
  if (!alreadyFromAsker) {
    // Replace the oldest example so representative messages stay recent.
    group.examples.shift();
    group.examples.push(example);
  }
}

function countUniqueAskers(group: QuestionGroup, latestUsername: string): number {
  // Only the examples are retained, so this is a lower bound once the group grows large.
  const askers = new Set(group.examples.map((e) => e.username));
  askers.add(latestUsername);
  return Math.max(group.uniqueAskers, askers.size);
}

/**
 * Marks open and handled groups as having a visible response when a broadcaster
 * message shares content words with a recent question. This is a heuristic: it
 * only means a reply with overlapping wording was seen in the chat window.
 */
export function markResponses(
  groups: QuestionGroup[],
  reply: { seq: number; tokens: string[] },
): number {
  let marked = 0;
  for (const group of groups) {
    if (group.responseDetected) continue;
    if (reply.seq - group.latestSeq > RESPONSE_WINDOW_MESSAGES) continue;
    if (sharedCount(group.tokens, reply.tokens) >= 1) {
      group.responseDetected = true;
      marked += 1;
    }
  }
  return marked;
}

/** Drops the oldest handled groups first, then the oldest open groups, to stay bounded. */
export function trimQuestionGroups(groups: QuestionGroup[]): void {
  while (groups.length > MAX_QUESTION_GROUPS) {
    const handledIndex = groups.findIndex((g) => g.status === "handled");
    const index = handledIndex >= 0 ? handledIndex : 0;
    groups.splice(index, 1);
  }
}
