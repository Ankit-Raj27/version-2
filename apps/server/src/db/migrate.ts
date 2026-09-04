import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { repoRoot } from "../config/paths.js";
import { db } from "./client.js";

const migrationsFolder = path.join(repoRoot, "apps", "server", "drizzle");

export function runMigrations(): void {
  migrate(db, { migrationsFolder });
}
