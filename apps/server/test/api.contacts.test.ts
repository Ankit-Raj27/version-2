import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { contacts, conversations, drafts, messages } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { makeMessage } from "./factories.js";

const app = await buildApp();

function seedConversation() {
  const persisted = persistMessage(makeMessage());
  return persisted.conversationId!;
}

beforeEach(() => {
  db.delete(drafts).run();
  db.delete(messages).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/conversations/:id/contact", () => {
  it("returns the contact with its policy fields and safe defaults", async () => {
    const conversationId = seedConversation();
    const response = await app.inject({
      method: "GET",
      url: `/api/conversations/${conversationId}/contact`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().contact).toMatchObject({
      whatsappJid: "919876543210@s.whatsapp.net",
      relationship: "UNKNOWN",
      replyMode: "OFF",
      notes: null
    });
  });

  it("404s when the conversation has no contact", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/conversations/999999/contact"
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("PATCH /api/conversations/:id/contact", () => {
  it("updates relationship and reply mode", async () => {
    const conversationId = seedConversation();
    const response = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversationId}/contact`,
      payload: { relationship: "FRIEND", replyMode: "DRAFT" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().contact).toMatchObject({
      relationship: "FRIEND",
      replyMode: "DRAFT"
    });
    expect(db.select().from(contacts).get()).toMatchObject({
      relationship: "FRIEND",
      replyMode: "DRAFT"
    });
  });

  it("stores and returns notes, and clears them with null", async () => {
    const conversationId = seedConversation();

    const set = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversationId}/contact`,
      payload: { notes: "college friend, keep it casual" }
    });
    expect(set.json().contact.notes).toBe("college friend, keep it casual");

    const clear = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversationId}/contact`,
      payload: { notes: null }
    });
    expect(clear.json().contact.notes).toBeNull();
  });

  it("rejects an invalid relationship with 400 and no mutation", async () => {
    const conversationId = seedConversation();
    const response = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversationId}/contact`,
      payload: { relationship: "bestie" }
    });

    expect(response.statusCode).toBe(400);
    expect(db.select().from(contacts).get()?.relationship).toBe("UNKNOWN");
  });

  it("rejects an invalid reply mode with 400 and no mutation", async () => {
    const conversationId = seedConversation();
    const response = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversationId}/contact`,
      payload: { replyMode: "always_send" }
    });

    expect(response.statusCode).toBe(400);
    expect(db.select().from(contacts).get()?.replyMode).toBe("OFF");
  });

  it("rejects unknown / internal fields with 400 (strict schema)", async () => {
    const conversationId = seedConversation();
    const before = db.select().from(contacts).get();

    const response = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversationId}/contact`,
      payload: { whatsappJid: "evil@s.whatsapp.net", id: 999 }
    });

    expect(response.statusCode).toBe(400);
    expect(db.select().from(contacts).get()).toMatchObject({
      whatsappJid: before!.whatsappJid,
      id: before!.id
    });
  });

  it("404s when the conversation has no contact", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/conversations/999999/contact",
      payload: { replyMode: "DRAFT" }
    });
    expect(response.statusCode).toBe(404);
  });
});
