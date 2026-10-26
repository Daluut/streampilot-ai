import type { MessageKind } from "@/lib/types";

// Transparent keyword rules. These classify the purpose of a message, not its sentiment.
const SUGGESTION_PATTERN =
  /\b(should|try|suggest|suggestion|consider|recommend|maybe you|you could|switch to|instead of)\b/i;
const TECHNICAL_PATTERN =
  /\b(lag|lagging|laggy|audio|mic|buffering|buffer|crash|crashed|freeze|freezing|frozen|stutter|stuttering|bug|fps|disconnected|cut out|blurry|quality|stream is)\b/i;
const REACTION_PATTERN =
  /\b(lol|lmao|lmfao|gg|pog|poggers|wow|omg|nice|clean|insane|hype|haha+|rip|based|goat|wtf|finally)\b/i;

/**
 * Classifies a message by its purpose. Questions take priority, then suggestions,
 * technical reports and reactions. Anything else is "other".
 */
export function classifyKind(text: string, isQuestionMessage: boolean): MessageKind {
  if (isQuestionMessage) return "question";
  if (SUGGESTION_PATTERN.test(text)) return "suggestion";
  if (TECHNICAL_PATTERN.test(text)) return "technical";
  if (REACTION_PATTERN.test(text)) return "reaction";
  return "other";
}

export const EMPTY_KIND_COUNTS: Record<MessageKind, number> = {
  question: 0,
  suggestion: 0,
  technical: 0,
  reaction: 0,
  other: 0,
};
