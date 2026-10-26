// Text normalisation helpers shared by question detection, grouping, topics and sentiment.

export const MAX_MESSAGE_LENGTH = 500;

/**
 * Removes control characters, collapses whitespace and caps the length of a
 * chat message. Chat text is always rendered as plain text by React, so this
 * function only has to make the content safe to store and compare.
 */
export function sanitizeMessageText(raw: string): { text: string; truncated: boolean } {
  // Strip ASCII control characters (keep normal spacing characters, which are collapsed below).
  const withoutControls = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  const collapsed = withoutControls.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_MESSAGE_LENGTH) {
    return { text: collapsed, truncated: false };
  }
  return { text: `${collapsed.slice(0, MAX_MESSAGE_LENGTH - 1)}…`, truncated: true };
}

const SLANG: Record<string, string> = {
  u: "you",
  ur: "your",
  urs: "yours",
  r: "are",
  ya: "you",
  yall: "you",
  wat: "what",
  wut: "what",
  whats: "what",
  using: "use",
  used: "use",
  wep: "weapon",
  wepon: "weapon",
  weps: "weapon",
  lvl: "level",
  bc: "because",
  cuz: "because",
  tbh: "",
  thx: "thanks",
  ty: "thanks",
  gg: "",
};

export const STOPWORDS = new Set([
  "a", "about", "all", "also", "am", "an", "and", "any", "anybody", "anyone", "are", "as", "at",
  "be", "been", "being", "but", "by", "can", "could", "did", "do", "does", "doing", "dont",
  "don't", "for", "from", "get", "got", "had", "has", "have", "how", "i", "i'm", "im", "if", "in",
  "into", "is", "isn't", "isnt", "it", "it's", "its", "just", "know", "like", "lol", "lmao",
  "me", "more", "most", "my", "no", "not", "of", "oh", "ok", "okay", "on", "or", "our", "out",
  "over", "please", "pls", "plz", "really", "so", "some", "still", "than", "thanks", "that",
  "the", "their", "them", "then", "there", "these", "they", "this", "to", "too", "up", "very",
  "was", "we", "were", "what", "when", "where", "which", "who", "why", "will", "with", "would",
  "yeah", "yes", "yet", "you", "your", "guys", "chat", "one", "even", "much", "way", "think",
  "going", "gonna", "want", "need", "make", "see", "say", "said", "good", "tho", "though",
  "rn", "tbh", "gg", "here", "now", "does", "doesn't", "did", "didn't", "let's", "lets",
  "wait", "same", "only", "anything", "something", "everyone", "other", "any", "every",
]);

/**
 * Lower-cases, splits on anything that is not a letter, digit or apostrophe, expands a few
 * common chat abbreviations and applies a light plural-stripping stemmer.
 */
export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);

  const tokens: string[] = [];
  for (const word of words) {
    const expanded = SLANG[word] ?? word;
    if (!expanded) continue;
    for (const part of expanded.split(" ")) {
      tokens.push(stem(part));
    }
  }
  return tokens.filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function stem(word: string): string {
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/** Unique content tokens for a message, used for similarity and topic detection. */
export function contentTokens(text: string): string[] {
  return [...new Set(tokenize(text))];
}

/** Jaccard similarity between two token lists (0–1). */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Number of tokens shared by both lists. */
export function sharedCount(a: readonly string[], b: readonly string[]): number {
  const setB = new Set(b);
  let shared = 0;
  for (const token of new Set(a)) {
    if (setB.has(token)) shared += 1;
  }
  return shared;
}
