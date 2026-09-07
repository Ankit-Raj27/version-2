import { z } from "zod";

export const usageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative().nullish(),
  completion_tokens: z.number().int().nonnegative().nullish(),
  total_tokens: z.number().int().nonnegative().nullish(),
  completion_tokens_details: z
    .object({ reasoning_tokens: z.number().int().nonnegative().nullish() })
    .nullish(),
  prompt_tokens_details: z
    .object({ cached_tokens: z.number().int().nonnegative().nullish() })
    .nullish()
});

export const chatCompletionSchema = z.object({
  model: z.string(),
  choices: z
    .array(
      z.object({
        message: z.object({
          role: z.string(),
          content: z.string().nullable()
        }),
        finish_reason: z.string().nullish()
      })
    )
    .min(1),
  usage: usageSchema.nullish()
});

export const errorEnvelopeSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    code: z.union([z.string(), z.number()]).nullish()
  })
});

export type ChatCompletionResponse = z.infer<typeof chatCompletionSchema>;
