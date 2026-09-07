// One hardcoded prompt to whichever OpenAI-compatible provider is configured
// in .env (AI_API_BASE_URL / AI_MODEL / AI_REASONING_EFFORT). Validates key,
// base URL, model id, structured output, and usage shape. Costs a few cents
// to run. Usage: tsx scripts/ai-smoke.ts

import { draftJsonSchema } from "../src/agent/drafting/output.schema.js";
import { AiError } from "../src/ai/errors.js";
import { createOpenAiCompatibleClient } from "../src/ai/openai-compatible/client.js";
import { env } from "../src/config/env.js";

if (!env.AI_API_KEY) {
  console.error(
    "AI_API_KEY is not set. Set AI_DRAFTING_ENABLED=true and AI_API_KEY in .env first."
  );
  process.exit(1);
}

const client = createOpenAiCompatibleClient({
  apiKey: env.AI_API_KEY,
  baseUrl: env.AI_API_BASE_URL,
  model: env.AI_MODEL,
  timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
  reasoningEffort: env.AI_REASONING_EFFORT
});

try {
  const result = await client.complete({
    messages: [
      {
        role: "system",
        content: "Respond only with the requested JSON."
      },
      {
        role: "user",
        content:
          'Draft a one-sentence WhatsApp reply to: "hey, are we still on for lunch tomorrow?"'
      }
    ],
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    temperature: env.AI_TEMPERATURE,
    jsonSchema: draftJsonSchema
  });

  console.log("Base URL:", env.AI_API_BASE_URL);
  console.log("Model requested:", env.AI_MODEL);
  console.log("Model echoed back:", result.model);
  console.log("Latency:", result.latencyMs, "ms");
  console.log("Finish reason:", result.finishReason);
  console.log("Usage:", result.usage);
  console.log("Raw text:", result.text);
} catch (err) {
  if (err instanceof AiError) {
    console.error(`AiError [${err.kind}]${err.status ? ` (status ${err.status})` : ""}: ${err.message}`);
  } else {
    console.error(err);
  }

  process.exitCode = 1;
}
