const QUESTION_STARTERS =
  /^(anyone|anybody|who|what|whats|which|where|when|why|how|hows|is|are|am|was|were|do|does|did|can|could|would|should|will|has|have|any)\b/i;

/**
 * Rule-based question detection. A message is a question when it contains a
 * question mark, or when it opens with a question word or auxiliary verb and
 * has at least three words. This is deliberately simple and transparent.
 */
export function isQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  const wordCount = trimmed.split(/\s+/).length;
  if (trimmed.includes("?")) {
    return /[\p{L}\p{N}]/u.test(trimmed);
  }
  return wordCount >= 3 && QUESTION_STARTERS.test(trimmed);
}
