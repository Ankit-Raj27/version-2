import path from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { repoRoot } from "./paths.js";

loadEnv({ path: path.join(repoRoot, ".env"), quiet: true });

const rawEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    SERVER_HOST: z.string().min(1).default("127.0.0.1"),
    SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DASHBOARD_ORIGIN: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1).optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    WHATSAPP_ENABLED: z.stringbool().default(true),
    WHATSAPP_AUTH_DIR: z.string().min(1).default('../../data/whatsapp-auth'),
    WHATSAPP_KILL_SWITCH: z.stringbool().default(true),

    AI_DRAFTING_ENABLED: z.stringbool().default(false),
    AI_API_KEY: z.string().min(1).optional(),
    AI_API_BASE_URL: z.url().default("https://api.openai.com/v1"),
    AI_MODEL: z.string().min(1).default("gpt-5.6-luna"),
    AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(512),
    AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.6),
    AI_REASONING_EFFORT: z
      .enum(["", "minimal", "low", "medium", "high", "xhigh"])
      .default(""),
    AI_CONTEXT_MESSAGE_LIMIT: z.coerce.number().int().min(10).max(50).default(30),
    AI_DRAFT_ALLOWED_JIDS: z.string().default(""),

    DRAFT_TTL_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),

 
    MEMORY_ENABLED: z.stringbool().default(false),
    MEMORY_EXTRACT_EVERY_N_MESSAGES: z.coerce.number().int().min(1).default(10),
    MEMORY_MAX_FACTS_PER_CONTACT: z.coerce.number().int().min(1).default(50)
  })
  .superRefine((data, ctx) => {
    if (data.AI_DRAFTING_ENABLED && !data.AI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_API_KEY"],
        message: "AI_API_KEY is required when AI_DRAFTING_ENABLED is true"
      });
    }

    if (data.MEMORY_ENABLED && !data.AI_DRAFTING_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["MEMORY_ENABLED"],
        message:
          "MEMORY_ENABLED requires AI_DRAFTING_ENABLED: extraction runs off the drafting pipeline and shares its AI client"
      });
    }

    if (data.AI_MODEL.includes("contributor")) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_MODEL"],
        message:
          "Contributor-tier models allow Meta to train on your messages. Use the non-contributor model id."
      });
    }
  });

const parsed = rawEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables", z.treeifyError(parsed.error));
  throw new Error("Environment validation failed");
}

const databaseUrl = parsed.data.DATABASE_URL ?? (
  parsed.data.NODE_ENV === "test" ? ":memory:" : "./data/personal-ai.db"
);

const aiDraftAllowedJids = parsed.data.AI_DRAFT_ALLOWED_JIDS.split(",")
  .map((jid) => jid.trim())
  .filter((jid) => jid.length > 0);

export const env = {
  ...parsed.data,
  DATABASE_URL: databaseUrl,
  AI_DRAFT_ALLOWED_JIDS: aiDraftAllowedJids
};

