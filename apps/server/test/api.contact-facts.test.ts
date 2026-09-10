import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listFacts, proposeFacts } from "../src/agent/memory/memory.repository.js";
import { buildApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { contacts, conversations, drafts, memoryFacts, messages } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { getConversationContact } from "../src/messaging/queries.js";
import { makeMessage } from "./factories.js";

const app = await buildApp();

function seedWithFacts(facts = ["Works at Zomato", "Has a dog named Biscuit"]) {
  const persisted = persistMessage(makeMessage());
  const conversationId = persisted.conversationId!;
  const contactId = getConversationContact(conversationId)!.contactId;

  proposeFacts({
    contactId,
    facts,
    sourceMessageId: persisted.messageId!,
    promptVersion: "memory-extract@v1"
  });

  return { conversationId, contactId, factIds: listFacts(contactId).map((row) => row.id) };
}

beforeEach(() => {
  db.delete(memoryFacts).run();
  db.delete(drafts).run();
  db.delete(messages).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/conversations/:id/contact/facts", () => {
  it("lists facts with their status and provenance", async () => {
    const { conversationId } = seedWithFacts();

    const response = await app.inject({
      method: "GET",
      url: `/api/conversations/${conversationId}/contact/facts`
    });

    expect(response.statusCode).toBe(200);
    const facts = response.json().facts;
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({ fact: "Works at Zomato", status: "proposed" });
    expect(facts[0].sourceMessageId).toEqual(expect.any(Number));
  });

  it("404s for a conversation with no contact", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/conversations/9999/contact/facts"
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("PATCH /api/conversations/:id/contact/facts/:factId", () => {
  it("confirms a fact", async () => {
    const { conversationId, factIds } = seedWithFacts();

    const response = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversationId}/contact/facts/${factIds[0]}`,
      payload: { status: "confirmed" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().fact).toMatchObject({ status: "confirmed" });
  });

  it("rejects a fact without deleting it", async () => {
    const { conversationId, contactId, factIds } = seedWithFacts();

    await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversationId}/contact/facts/${factIds[0]}`,
      payload: { status: "rejected" }
    });

    expect(listFacts(contactId)).toHaveLength(2);
    expect(listFacts(contactId)[0]?.status).toBe("rejected");
  });

  it("refuses any status other than confirmed or rejected", async () => {
    const { conversationId, contactId, factIds } = seedWithFacts();

    const response = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversationId}/contact/facts/${factIds[0]}`,
      payload: { status: "proposed" }
    });

    expect(response.statusCode).toBe(400);
    expect(listFacts(contactId)[0]?.status).toBe("proposed");
  });

  it("refuses unknown fields", async () => {
    const { conversationId, factIds } = seedWithFacts();

    const response = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversationId}/contact/facts/${factIds[0]}`,
      payload: { status: "confirmed", contactId: 99 }
    });

    expect(response.statusCode).toBe(400);
  });

  it("404s for a fact belonging to another contact", async () => {
    const { conversationId } = seedWithFacts();

    const response = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversationId}/contact/facts/9999`,
      payload: { status: "confirmed" }
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("DELETE /api/conversations/:id/contact/facts/:factId", () => {
  it("removes the fact", async () => {
    const { conversationId, contactId, factIds } = seedWithFacts();

    const response = await app.inject({
      method: "DELETE",
      url: `/api/conversations/${conversationId}/contact/facts/${factIds[0]}`
    });

    expect(response.statusCode).toBe(204);
    expect(listFacts(contactId)).toHaveLength(1);
  });

  it("404s for an unknown fact", async () => {
    const { conversationId } = seedWithFacts();

    const response = await app.inject({
      method: "DELETE",
      url: `/api/conversations/${conversationId}/contact/facts/9999`
    });

    expect(response.statusCode).toBe(404);
  });
});
