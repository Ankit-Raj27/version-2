import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(serverDir, "../..");

loadEnv({ path: path.join(repoRoot, ".env"), quiet: true });

const configuredUrl = process.env.DATABASE_URL ?? "./data/personal-ai.db";
const databaseUrl = configuredUrl === ":memory:"
  ? configuredUrl
  : path.resolve(repoRoot, configuredUrl);

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl
  },
  strict: true,
  verbose: true
});
