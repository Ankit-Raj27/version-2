process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.DATABASE_URL = ":memory:";

const { runMigrations } = await import("../src/db/migrate.js");

runMigrations();
