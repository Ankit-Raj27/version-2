import path from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { repoRoot } from "./paths.js";

loadEnv({ path: path.join(repoRoot, ".env"), quiet: true });

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVER_HOST: z.string().min(1).default("127.0.0.1"),
  SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  WHATSAPP_ENABLED: z.stringbool().default(true),
  WHATSAPP_AUTH_DIR: z.string().min(1).default('../../data/whatsapp-auth'),
  WHATSAPP_KILL_SWITCH: z.stringbool().default(true)
});

const parsed = rawEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables", z.treeifyError(parsed.error));
  throw new Error("Environment validation failed");
}

const databaseUrl = parsed.data.DATABASE_URL ?? (
  parsed.data.NODE_ENV === "test" ? ":memory:" : "./data/personal-ai.db"
);

export const env = {
  ...parsed.data,
  DATABASE_URL: databaseUrl
};

