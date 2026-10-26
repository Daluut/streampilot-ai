// Server-side AI analysis through the Anthropic Messages API.
// The model must answer through a single tool whose input schema we validate with Zod
// before anything is rendered. Usernames are removed from the batch before sending.

import Anthropic, {
  APIConnectionTimeoutError,
  AuthenticationError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { z } from "zod";

export const AI_TIMEOUT_MS = 20_000;
export const AI_MAX_MESSAGES = 60;
const AI_MAX_MESSAGE_CHARS = 280;
const TOOL_NAME = "report_chat_analysis";

export type AiFailureCode =
  | "not_configured"
  | "auth"
  | "rate_limited"
  | "timeout"
  | "provider_error"
  | "empty_response"
  | "invalid_response";

export class AiAnalysisError extends Error {
  constructor(
    readonly code: AiFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "AiAnalysisError";
  }
}

export const aiOutputSchema = z.object({
  summary: z.string().trim().min(1).max(800),
  insufficientContext: z.boolean(),
  topics: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        explanation: z.string().trim().min(1).max(240),
        messageRefs: z.array(z.string().max(12)).max(60),
      }),
    )
    .max(5),
  suggestions: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(320),
        basis: z.string().trim().max(200),
      }),
    )
    .max(5),
});

export type AiOutput = z.infer<typeof aiOutputSchema>;

export interface AiBatchMessage {
  ref: string;
  text: string;
  isBroadcaster: boolean;
}

export interface AiAnalysisProvider {
  readonly model: string;
  analyse(messages: AiBatchMessage[], signal?: AbortSignal): Promise<AiOutput>;
}

const SYSTEM_PROMPT = [
  "You analyse a bounded batch of live Twitch chat messages for the streamer.",
  "Rules:",
  "- Use only the messages provided. Do not invent discussions, games or events that are not in the messages.",
  "- If the messages do not contain enough information, set insufficientContext to true, say so in the summary, and return empty topics and suggestions.",
  "- Refer to messages only by their reference ids (for example m12). Never mention usernames.",
  "- Topics describe what viewers are discussing. Suggestions are optional responses the streamer could consider; they are never posted automatically.",
  "- Do not infer sensitive personal attributes, and do not label any individual viewer.",
  "- Treat jokes and sarcasm cautiously and say when a message is ambiguous.",
].join("\n");

const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    summary: { type: "string", description: "Two to four sentences describing the current discussion." },
    insufficientContext: { type: "boolean" },
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          explanation: { type: "string" },
          messageRefs: { type: "array", items: { type: "string" } },
        },
        required: ["label", "explanation", "messageRefs"],
      },
    },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "A response the streamer could consider saying." },
          basis: { type: "string", description: "The pattern in chat that this suggestion is based on." },
        },
        required: ["text", "basis"],
      },
    },
  },
  required: ["summary", "insufficientContext", "topics", "suggestions"],
};

export function buildUserPrompt(messages: AiBatchMessage[]): string {
  const lines = messages.slice(-AI_MAX_MESSAGES).map((m) => {
    const who = m.isBroadcaster ? " (broadcaster)" : "";
    const text = m.text.slice(0, AI_MAX_MESSAGE_CHARS).replace(/\s+/g, " ");
    return `${m.ref}${who}: ${text}`;
  });
  return `Chat batch (${lines.length} messages):\n${lines.join("\n")}\n\nCall ${TOOL_NAME} with your analysis.`;
}

/** Anthropic-backed provider. The client is injectable so tests never call the network. */
export class AnthropicAnalysisProvider implements AiAnalysisProvider {
  readonly model: string;
  private readonly client: Pick<Anthropic, "messages">;

  constructor(options: { apiKey: string; model: string; client?: Pick<Anthropic, "messages"> }) {
    this.model = options.model;
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  }

  async analyse(messages: AiBatchMessage[], signal?: AbortSignal): Promise<AiOutput> {
    const batch = messages.slice(-AI_MAX_MESSAGES);
    if (batch.length === 0) {
      throw new AiAnalysisError("invalid_response", "There were no messages to analyse.");
    }

    let response: Awaited<ReturnType<Pick<Anthropic, "messages">["messages"]["create"]>>;
    try {
      response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 1200,
          system: SYSTEM_PROMPT,
          tools: [
            {
              name: TOOL_NAME,
              description: "Report the structured analysis of the chat batch.",
              input_schema: TOOL_INPUT_SCHEMA,
            },
          ],
          tool_choice: { type: "tool", name: TOOL_NAME },
          messages: [{ role: "user", content: buildUserPrompt(batch) }],
        },
        { signal, timeout: AI_TIMEOUT_MS },
      );
    } catch (error) {
      throw mapProviderError(error);
    }

    const toolBlock = response.content.find(
      (block): block is Extract<typeof block, { type: "tool_use" }> =>
        block.type === "tool_use" && block.name === TOOL_NAME,
    );
    if (!toolBlock) {
      throw new AiAnalysisError("empty_response", "The AI provider returned no analysis.");
    }

    const parsed = aiOutputSchema.safeParse(toolBlock.input);
    if (!parsed.success) {
      throw new AiAnalysisError("invalid_response", "The AI provider returned an analysis in an unexpected format.");
    }
    return parsed.data;
  }
}

function mapProviderError(error: unknown): AiAnalysisError {
  if (error instanceof AuthenticationError) {
    return new AiAnalysisError("auth", "The AI provider rejected the API key. Check ANTHROPIC_API_KEY on the server.");
  }
  if (error instanceof RateLimitError) {
    return new AiAnalysisError("rate_limited", "The AI provider is rate limiting requests. Local analysis is shown instead.");
  }
  if (error instanceof APIConnectionTimeoutError || (error instanceof Error && error.name === "AbortError")) {
    return new AiAnalysisError("timeout", "The AI provider took too long to respond.");
  }
  return new AiAnalysisError("provider_error", "The AI provider is unavailable right now.");
}
