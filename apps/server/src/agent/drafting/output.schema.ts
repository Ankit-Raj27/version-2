import { z } from "zod";
import type { AiJsonSchema } from "../../ai/ai.types.js";

export const draftOutputSchema = z.object({
  reply: z.string().min(1).max(2000)
});

export const draftJsonSchema: AiJsonSchema = {
  name: "whatsapp_reply_draft",
  schema: {
    type: "object",
    properties: { reply: { type: "string" } },
    required: ["reply"],
    additionalProperties: false
  }
};

export type DraftOutputResult =
  | { ok: true; text: string }
  | { ok: false; kind: "invalid_response" | "empty_output" };

export function parseDraftOutput(rawText: string): DraftOutputResult {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return { ok: false, kind: "invalid_response" };
  }

  const parsed = draftOutputSchema.safeParse(parsedJson);

  if (!parsed.success) {
    return { ok: false, kind: "invalid_response" };
  }

  const cleaned = parsed.data.reply.trim().replace(/\n{3,}/g, "\n\n");

  if (!cleaned) {
    return { ok: false, kind: "empty_output" };
  }

  return { ok: true, text: cleaned };
}
