import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { contacts, conversations, messages } from "../db/schema.js";
import type {
  NormalizedMessage,
  NormalizedParty,
  PersistResult
} from "./message.types.js";

export function persistMessage(message: NormalizedMessage): PersistResult {
  if (!message.externalMessageId.trim()) {
    return { status: "skipped", reason: "no external message id" };
  }

  if (!message.externalConversationId.trim()) {
    return { status: "skipped", reason: "no conversation id" };
  }

  return db.transaction((tx) => {
    const upsertContact = (party: NormalizedParty): number => {
      tx.insert(contacts)
        .values({
          whatsappJid: party.jid,
          altJid: party.altJid ?? null,
          displayName: party.displayName ?? null,
          replyMode: "OFF"
        })
        .onConflictDoNothing({ target: contacts.whatsappJid })
        .run();

      const contact = tx
        .select({
          id: contacts.id,
          altJid: contacts.altJid,
          displayName: contacts.displayName
        })
        .from(contacts)
        .where(eq(contacts.whatsappJid, party.jid))
        .get();

      if (!contact) {
        throw new Error(`Failed to resolve contact for JID ${party.jid}`);
      }

      const nextAltJid = party.altJid ?? contact.altJid;
      const nextDisplayName = party.displayName ?? contact.displayName;

      if (
        nextAltJid !== contact.altJid ||
        nextDisplayName !== contact.displayName
      ) {
        tx.update(contacts)
          .set({
            altJid: nextAltJid,
            displayName: nextDisplayName,
            updatedAt: new Date()
          })
          .where(eq(contacts.id, contact.id))
          .run();
      }

      return contact.id;
    };

    const peerContactId =
      message.conversationType === "direct" && message.conversationPeer
        ? upsertContact(message.conversationPeer)
        : null;

    tx.insert(conversations)
      .values({
        externalConversationId: message.externalConversationId,
        contactId: peerContactId,
        type: message.conversationType
      })
      .onConflictDoNothing({ target: conversations.externalConversationId })
      .run();

    const conversation = tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        eq(
          conversations.externalConversationId,
          message.externalConversationId
        )
      )
      .get();

    if (!conversation) {
      throw new Error(
        `Failed to resolve conversation ${message.externalConversationId}`
      );
    }

    const senderId =
      message.direction === "outgoing" || !message.sender
        ? null
        : message.conversationType === "direct"
          ? peerContactId
          : upsertContact(message.sender);

    const quotedExternalMessageId = message.quote?.externalMessageId ?? null;
    const quotedMessage = quotedExternalMessageId
      ? tx
          .select({ id: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conversation.id),
              eq(messages.externalMessageId, quotedExternalMessageId)
            )
          )
          .get()
      : undefined;

    const insertResult = tx
      .insert(messages)
      .values({
        conversationId: conversation.id,
        externalMessageId: message.externalMessageId,
        senderId,
        direction: message.direction,
        type: message.type,
        text: message.text,
        origin: message.origin,
        quotedExternalMessageId,
        quotedMessageId: quotedMessage?.id ?? null,
        timestamp: new Date(message.timestamp),
        metadata: {
          ...message.metadata,
          timestampWasSynthesized: message.timestampWasSynthesized
        }
      })
      .onConflictDoNothing({
        target: [messages.conversationId, messages.externalMessageId]
      })
      .run();

    if (insertResult.changes === 0) {
      const existing = tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversation.id),
            eq(messages.externalMessageId, message.externalMessageId)
          )
        )
        .get();

      if (!existing) {
        throw new Error(
          `Message dedupe conflict could not resolve ${message.externalMessageId}`
        );
      }

      return {
        status: "deduped",
        messageId: existing.id,
        conversationId: conversation.id
      };
    }

    const messageTimestamp = new Date(message.timestamp);

    tx.update(conversations)
      .set({ lastMessageAt: messageTimestamp })
      .where(
        and(
          eq(conversations.id, conversation.id),
          or(
            isNull(conversations.lastMessageAt),
            lt(conversations.lastMessageAt, messageTimestamp)
          )
        )
      )
      .run();

    return {
      status: "inserted",
      messageId: Number(insertResult.lastInsertRowid),
      conversationId: conversation.id
    };
  });
}
