import { z } from "zod";
import type { AiJsonSchema } from "../../ai/ai.types.js";

const MAX_FACTS_PER_RUN = 10;

export const memoryOutputSchema = z.object({
  facts: z.array(z.string()).max(MAX_FACTS_PER_RUN)
});

export const memoryJsonSchema: AiJsonSchema = {
  name: "contact_memory_facts",
  schema: {
    type: "object",
    properties: {
      facts: { type: "array", items: { type: "string" } }
    },
    required: ["facts"],
    additionalProperties: false
  }
};

export function parseMemoryOutput(rawText: string): string[] | null {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return null;
  }

  const parsed = memoryOutputSchema.safeParse(parsedJson);

  if (!parsed.success) {
    return null;
  }

  return parsed.data.facts
    .map((fact) => fact.trim().replace(/\s+/g, " "))
    .filter((fact) => fact.length > 0);
}
