import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { env } from "../src/config/env.js";

const app = await buildApp();

afterAll(async () => {
  await app.close();
});

// app.inject bypasses CORS, so no other suite would catch a blocked preflight.
describe("CORS preflight", () => {
  it.each(["PATCH", "DELETE", "POST", "GET"])(
    "allows %s from the dashboard origin",
    async (method) => {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/conversations/1/contact",
        headers: {
          origin: env.DASHBOARD_ORIGIN,
          "access-control-request-method": method,
          "access-control-request-headers": "content-type"
        }
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-methods"]).toContain(method);
    }
  );

  it("does not echo an unknown origin", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/conversations/1/contact",
      headers: {
        origin: "http://evil.example",
        "access-control-request-method": "PATCH"
      }
    });

    expect(response.headers["access-control-allow-origin"]).not.toBe("http://evil.example");
  });
});
