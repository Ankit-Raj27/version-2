import type { AiClient, AiCompletionRequest, AiCompletionResult } from "../ai.types.js";
import { AiError, aiErrorKindFromStatus } from "../errors.js";
import { chatCompletionSchema, errorEnvelopeSchema } from "./schema.js";

export interface OpenAiCompatibleClientConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** Omit (empty string) for models/providers that reject an unrecognized reasoning_effort param. */
  reasoningEffort: "" | "minimal" | "low" | "medium" | "high" | "xhigh";
}

/**
 * Client for any provider exposing an OpenAI-compatible chat completions
 * endpoint — Meta's Model API, OpenAI itself, and Google's Gemini compat
 * layer have all been verified to work against this same implementation;
 * only `baseUrl`/`model`/`reasoningEffort` change between them.
 */
export function createOpenAiCompatibleClient(config: OpenAiCompatibleClientConfig): AiClient {
  return {
    async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
      const startedAt = Date.now();
      const body: Record<string, unknown> = {
        model: config.model,
        messages: request.messages,
        max_completion_tokens: request.maxOutputTokens
      };

      if (config.reasoningEffort) {
        body.reasoning_effort = config.reasoningEffort;
      }

      if (request.temperature !== undefined) {
        body.temperature = request.temperature;
      }

      if (request.jsonSchema) {
        body.response_format = {
          type: "json_schema",
          json_schema: {
            name: request.jsonSchema.name,
            strict: true,
            schema: request.jsonSchema.schema
          }
        };
      }

      let response: Response;

      try {
        response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(config.timeoutMs)
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "TimeoutError") {
          throw new AiError("timeout", "AI provider request timed out", { cause: err });
        }

        throw new AiError("network", "AI provider request failed", { cause: err });
      }

      const latencyMs = Date.now() - startedAt;
      const rawBody: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const parsedError = errorEnvelopeSchema.safeParse(rawBody);
        const message = parsedError.success
          ? parsedError.data.error.message
          : `AI provider request failed with status ${response.status}`;

        throw new AiError(aiErrorKindFromStatus(response.status), message, {
          status: response.status
        });
      }

      const parsed = chatCompletionSchema.safeParse(rawBody);

      if (!parsed.success) {
        throw new AiError(
          "invalid_response",
          "AI provider response failed schema validation",
          { cause: parsed.error }
        );
      }

      const choice = parsed.data.choices[0];

      if (!choice) {
        throw new AiError("invalid_response", "AI provider response had no choices");
      }

      const text = choice.message.content?.trim() ?? "";

      if (!text) {
        throw new AiError("empty_output", "AI provider returned no usable text");
      }

      return {
        text,
        model: parsed.data.model,
        usage: {
          inputTokens: parsed.data.usage?.prompt_tokens ?? null,
          outputTokens: parsed.data.usage?.completion_tokens ?? null,
          totalTokens: parsed.data.usage?.total_tokens ?? null,
          reasoningTokens:
            parsed.data.usage?.completion_tokens_details?.reasoning_tokens ?? null,
          cachedInputTokens:
            parsed.data.usage?.prompt_tokens_details?.cached_tokens ?? null
        },
        latencyMs,
        finishReason: choice.finish_reason ?? null
      };
    }
  };
}
