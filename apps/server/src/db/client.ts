import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "../config/env.js";
import { repoRoot } from "../config/paths.js";
import * as schema from "./schema.js";

function resolveDatabasePath(databaseUrl: string): string {
  if (databaseUrl === ":memory:") {
    return databaseUrl;
  }

  const resolved = path.isAbsolute(databaseUrl)
    ? databaseUrl
    : path.resolve(repoRoot, databaseUrl);

  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

const sqlite = new Database(resolveDatabasePath(env.DATABASE_URL));

sqlite.pragma("foreign_keys = ON");

if (env.DATABASE_URL !== ":memory:") {
  sqlite.pragma("journal_mode = WAL");
}

export const db = drizzle(sqlite, { schema });

export function checkDatabase(): boolean {
  const row = sqlite.prepare("select 1 as ok").get() as { ok: number } | undefined;
  return row?.ok === 1;
}

export function closeDatabase(): void {
  if (sqlite.open) {
    sqlite.close();
  }
}
