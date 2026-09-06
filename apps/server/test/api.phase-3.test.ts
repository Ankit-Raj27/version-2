import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { contacts, conversations, messages } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { makeMessage } from "./factories.js";

const app = await buildApp();

beforeEach(() => {
  db.delete(messages).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
});

afterAll(async () => {
  await app.close();
});

describe("Phase 3 API", () => {
  it("reports system status without treating disconnected WhatsApp as HTTP failure", async () => {
    const response = await app.inject({ method: "GET", url: "/api/system/status" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      server: "ok",
      database: "ok",
      whatsapp: { state: "idle", connected: false }
    });
    expect(new Date(response.json().timestamp).toISOString()).toBe(response.json().timestamp);
  });

  it("lists conversations with ISO timestamps", async () => {
    persistMessage(makeMessage());
    const response = await app.inject({ method: "GET", url: "/api/conversations" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.conversations[0]).toMatchObject({
      title: "Friend",
      peerJid: "919876543210@s.whatsapp.net",
      lastMessagePreview: "hello"
    });
    expect(typeof body.conversations[0].lastMessageAt).toBe("string");
  });

  it("validates list and message parameters", async () => {
    expect((await app.inject({ method: "GET", url: "/api/conversations?limit=0" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/conversations/abc/messages" })).json()).toMatchObject({
      error: { code: "INVALID_CONVERSATION_ID" }
    });
    expect((await app.inject({ method: "GET", url: "/api/conversations/999999/messages" })).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/conversations/1/messages?beforeId=1"
        })
      ).json()
    ).toMatchObject({ error: { code: "INVALID_CURSOR" } });
  });

  it("returns messages oldest-first with pagination metadata", async () => {
    const first = persistMessage(makeMessage({ externalMessageId: "1", timestamp: 1_000 }));
    persistMessage(makeMessage({ externalMessageId: "2", timestamp: 2_000 }));
    const response = await app.inject({
      method: "GET",
      url: `/api/conversations/${first.conversationId}/messages?limit=1`
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.messages).toHaveLength(1);
    expect(body.hasMore).toBe(true);
    expect(body.oldest).toEqual({
      timestamp: new Date(2_000).toISOString(),
      id: body.messages[0].id
    });
  });

  it("adds the configured CORS header without moving health", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/system/status",
      headers: { origin: "http://localhost:3000" }
    });

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
  });
});
