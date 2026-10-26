// Combines the deterministic local engine with the optional AI provider.
// AI output is validated, its message references are checked against the batch, and any
// failure falls back to local rules with the error shown to the user.

import type { ChatMessage, AnalysisResult, QuestionGroup, TopicCluster, Suggestion } from "@/lib/types";
import { AiAnalysisError, type AiAnalysisProvider, type AiBatchMessage, type AiOutput } from "./ai-engine";
import { analyseLocally } from "./local-engine";

export interface AnalyseBatchInput {
  batch: readonly ChatMessage[];
  groups: readonly QuestionGroup[];
  provider: AiAnalysisProvider | null;
  analysisId: string;
  now: Date;
  signal?: AbortSignal;
}

export interface AnalyseBatchOutput {
  result: AnalysisResult;
  topicLabelsBySeq: Map<number, string[]>;
}

export async function analyseBatch(input: AnalyseBatchInput): Promise<AnalyseBatchOutput> {
  const { batch, groups, provider, analysisId, now } = input;
  const local = analyseLocally({ batch, groups, idPrefix: analysisId });

  const base = {
    id: analysisId,
    createdAt: now.toISOString(),
    batchSize: batch.length,
    firstSeq: batch[0]?.seq ?? 0,
    lastSeq: batch[batch.length - 1]?.seq ?? 0,
    sentiment: local.sentiment,
    messageKinds: local.messageKinds,
  };

  if (!provider || batch.length === 0) {
    return {
      result: {
        ...base,
        mode: "local",
        engineLabel: "Local rules",
        summary: local.summary,
        topics: local.topics,
        suggestions: local.suggestions,
        aiError: null,
      },
      topicLabelsBySeq: local.topicLabelsBySeq,
    };
  }

  try {
    const refToSeq = new Map<string, number>();
    const aiBatch: AiBatchMessage[] = batch.map((message, index) => {
      const ref = `m${index + 1}`;
      refToSeq.set(ref, message.seq);
      return { ref, text: message.text, isBroadcaster: message.isBroadcaster };
    });
    const output = await provider.analyse(aiBatch, input.signal);
    const mapped = mapAiOutput(output, refToSeq, batch);

    return {
      result: {
        ...base,
        mode: "ai",
        engineLabel: `Claude · ${provider.model}`,
        summary: output.summary,
        topics: mapped.topics.length > 0 ? mapped.topics : local.topics,
        suggestions: mapped.suggestions.length > 0 ? mapped.suggestions : local.suggestions,
        aiError: null,
      },
      topicLabelsBySeq: mapped.topics.length > 0 ? mapped.topicLabelsBySeq : local.topicLabelsBySeq,
    };
  } catch (error) {
    const message =
      error instanceof AiAnalysisError ? error.message : "The AI provider failed unexpectedly.";
    return {
      result: {
        ...base,
        mode: "local",
        engineLabel: "Local rules",
        summary: local.summary,
        topics: local.topics,
        suggestions: local.suggestions,
        aiError: message,
      },
      topicLabelsBySeq: local.topicLabelsBySeq,
    };
  }
}

function mapAiOutput(
  output: AiOutput,
  refToSeq: Map<string, number>,
  batch: readonly ChatMessage[],
): { topics: TopicCluster[]; suggestions: Suggestion[]; topicLabelsBySeq: Map<number, string[]> } {
  const bySeq = new Map(batch.map((m) => [m.seq, m]));
  const topicLabelsBySeq = new Map<number, string[]>();

  const topics: TopicCluster[] = [];
  for (const topic of output.topics) {
    // Keep only references that point at messages in this batch; drop invented ones.
    const seqs = [...new Set(topic.messageRefs.map((ref) => refToSeq.get(ref)).filter((s): s is number => s !== undefined))];
    if (seqs.length === 0) continue;
    const latest = Math.max(...seqs);
    for (const seq of seqs) {
      const labels = topicLabelsBySeq.get(seq) ?? [];
      labels.push(topic.label);
      topicLabelsBySeq.set(seq, labels);
    }
    topics.push({
      label: topic.label,
      explanation: topic.explanation,
      messageCount: seqs.length,
      latestAt: bySeq.get(latest)?.timestamp ?? batch[batch.length - 1].timestamp,
      sampleSeqs: seqs.slice(-3),
      source: "ai",
    });
  }

  const suggestions: Suggestion[] = output.insufficientContext
    ? []
    : output.suggestions.map((suggestion, index) => ({
        id: `ai-s${index + 1}`,
        text: suggestion.text,
        basis: suggestion.basis || "Model-suggested response",
      }));

  return { topics, suggestions, topicLabelsBySeq };
}
