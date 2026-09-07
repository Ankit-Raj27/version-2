import { env } from "../config/env.js";
import type { AiClient } from "./ai.types.js";
import { createOpenAiCompatibleClient } from "./openai-compatible/client.js";

// env.ts's superRefine guarantees AI_API_KEY is set whenever AI_DRAFTING_ENABLED is true.
export const aiClient: AiClient | null = env.AI_DRAFTING_ENABLED
  ? createOpenAiCompatibleClient({
      apiKey: env.AI_API_KEY!,
      baseUrl: env.AI_API_BASE_URL,
      model: env.AI_MODEL,
      timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
      reasoningEffort: env.AI_REASONING_EFFORT
    })
  : null;
