import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/client.js";
import { contacts, conversations, messages } from "../src/db/schema.js";
import { getConversation, listConversations, listMessages } from "../src/messaging/queries.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { makeMessage } from "./factories.js";

beforeEach(() => {
  db.delete(messages).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
});

describe("dashboard read queries", () => {
  it("orders conversations by activity and previews newest timestamp", () => {
    persistMessage(makeMessage({ externalMessageId: "old", timestamp: 1_000, text: "old" }));
    persistMessage(
      makeMessage({
        externalMessageId: "new-conversation",
        externalConversationId: "222@s.whatsapp.net",
        conversationPeer: { jid: "222@s.whatsapp.net" },
        sender: { jid: "222@s.whatsapp.net" },
        timestamp: 3_000,
        text: "newest"
      })
    );
    persistMessage(makeMessage({ externalMessageId: "late-insert", timestamp: 2_000, text: "middle" }));

    const rows = listConversations();
    expect(rows.map((row) => row.externalConversationId)).toEqual([
      "222@s.whatsapp.net",
      "919876543210@s.whatsapp.net"
    ]);
    expect(rows[1]).toMatchObject({
      title: "Friend",
      lastMessagePreview: "middle",
      lastMessageAt: new Date(2_000).toISOString()
    });
  });

  it("uses stable timestamp/id ordering and a gap-free composite cursor", () => {
    const first = persistMessage(makeMessage({ externalMessageId: "1", timestamp: 1_000 }));
    const second = persistMessage(makeMessage({ externalMessageId: "2", timestamp: 1_000 }));
    const third = persistMessage(makeMessage({ externalMessageId: "3", timestamp: 2_000 }));

    const newest = listMessages(first.conversationId!, 2);
    expect(newest.messages.map((message) => message.id)).toEqual([
      second.messageId,
      third.messageId
    ]);
    expect(newest.hasMore).toBe(true);

    const older = listMessages(first.conversationId!, 2, {
      timestamp: new Date(newest.oldest!.timestamp).getTime(),
      id: newest.oldest!.id
    });
    expect(older.messages.map((message) => message.id)).toEqual([first.messageId]);
    expect(older.hasMore).toBe(false);
  });

  it("resolves stored title before contact and JID fallbacks", () => {
    const result = persistMessage(
      makeMessage({ conversationPeer: { jid: "919876543210@s.whatsapp.net" }, sender: { jid: "919876543210@s.whatsapp.net" } })
    );
    db.update(conversations)
      .set({ title: "Stored title" })
      .where(eq(conversations.id, result.conversationId!))
      .run();

    expect(getConversation(result.conversationId!)?.title).toBe("Stored title");
  });

  it("returns group sender labels and quoted previews", () => {
    const quoted = persistMessage(
      makeMessage({
        externalMessageId: "quoted",
        externalConversationId: "group@g.us",
        conversationType: "group",
        conversationPeer: null,
        sender: { jid: "222@s.whatsapp.net", displayName: "Participant" },
        text: "original"
      })
    );
    persistMessage(
      makeMessage({
        externalMessageId: "reply",
        externalConversationId: "group@g.us",
        conversationType: "group",
        conversationPeer: null,
        sender: { jid: "222@s.whatsapp.net", displayName: "Participant" },
        quote: { externalMessageId: "quoted" },
        text: "response"
      })
    );

    expect(listMessages(quoted.conversationId!).messages.at(-1)).toMatchObject({
      senderLabel: "Participant",
      quotedPreview: "original"
    });
  });
});
