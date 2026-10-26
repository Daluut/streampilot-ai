import type { SentimentOverview } from "@/lib/types";

export type SentimentLabel = "positive" | "neutral" | "negative" | "ambiguous";

// A small, transparent word list. It is an approximation of tone, not a measure of emotion.
const POSITIVE = new Set([
  "love", "loved", "loving", "nice", "clean", "great", "awesome", "amazing", "good", "gg",
  "pog", "poggers", "insane", "hype", "based", "goat", "win", "won", "finally", "wholesome",
  "thank", "thanks", "glad", "fun", "enjoy", "perfect", "beautiful", "best", "lovely", "proud",
  "clutch", "sick", "lets", "let's", "congrats", "congratulations",
]);

const NEGATIVE = new Set([
  "hate", "hated", "unfair", "trash", "bad", "broken", "lag", "laggy", "frustrating",
  "frustrated", "ugh", "annoying", "rigged", "stupid", "boring", "quit", "lost", "lose", "losing",
  "died", "dies", "cheap", "awful", "terrible", "worst", "sucks", "bugged", "bug", "ruined",
  "awful", "wtf", "meh", "garbage",
]);

const NEGATORS = new Set([
  "not", "no", "never", "dont", "don't", "isnt", "isn't", "cant", "can't", "wont", "won't",
  "aint", "ain't", "didnt", "didn't", "doesnt", "doesn't",
]);

function rawTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/[^\p{L}']+/u)
    .filter(Boolean);
}

/**
 * Classifies one message. Negations flip the polarity of a word within the two
 * preceding tokens. Messages with both positive and negative cues are reported as
 * ambiguous and counted as neutral, because sarcasm and jokes are hard to detect.
 */
export function classifySentiment(text: string): SentimentLabel {
  const tokens = rawTokens(text);
  let positive = 0;
  let negative = 0;

  tokens.forEach((token, index) => {
    const negated = tokens.slice(Math.max(0, index - 2), index).some((t) => NEGATORS.has(t));
    const isPositive = POSITIVE.has(token);
    const isNegative = NEGATIVE.has(token);
    if (!isPositive && !isNegative) return;
    const effectivePositive = isPositive !== negated;
    if (effectivePositive) positive += 1;
    else negative += 1;
  });

  if (positive > 0 && negative > 0) return "ambiguous";
  if (positive > 0) return "positive";
  if (negative > 0) return "negative";
  return "neutral";
}

export function summariseSentiment(texts: readonly string[]): SentimentOverview {
  const overview: SentimentOverview = { positive: 0, neutral: 0, negative: 0, ambiguous: 0, total: 0 };
  for (const text of texts) {
    const label = classifySentiment(text);
    overview.total += 1;
    if (label === "ambiguous") {
      overview.ambiguous += 1;
      overview.neutral += 1;
    } else {
      overview[label] += 1;
    }
  }
  return overview;
}
