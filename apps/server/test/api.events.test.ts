import { afterAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { getSseClientCount } from "../src/api/routes/events.js";

const app = await buildApp();

afterAll(async () => {
  await app.close();
});

describe("GET /api/events", () => {
  it("streams retry and current WhatsApp status, then cleans up", async () => {
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/events`, {
      headers: { Origin: "http://localhost:3000" },
      signal: controller.signal
    });
    const reader = response.body?.getReader();
    const chunk = await reader?.read();
    const text = new TextDecoder().decode(chunk?.value);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000"
    );
    expect(text).toContain("retry: 3000");
    expect(text).toContain("event: whatsapp.status");
    expect(getSseClientCount()).toBe(1);

    controller.abort();
    await reader?.cancel().catch(() => undefined);

    await vi.waitFor(() => expect(getSseClientCount()).toBe(0));
  });
});
