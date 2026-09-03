import { afterAll, describe, expect, it } from "vitest";

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { buildApp } = await import("../src/app.js");
const app = await buildApp();

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("reports server and database health", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "personal-ai-server",
      database: "ok"
    });
  });
});
