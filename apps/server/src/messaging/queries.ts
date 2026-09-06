import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { contacts, conversations, messages } from "../db/schema.js";
import { formatJid, resolveConversationTitle } from "./display.js";
import type {
  ConversationSummary,
  ConversationView,
  MessagePage,
  MessageView
} from "./view.types.js";

function messagePreview(type: "text" | "unsupported", text: string | null): string {
  return type === "unsupported" ? "Unsupported message" : (text ?? "");
}

export function listConversations(limit = 100): ConversationSummary[] {
  const rows = db
    .select({
      id: conversations.id,
      type: conversations.type,
      title: conversations.title,
      externalConversationId: conversations.externalConversationId,
      lastMessageAt: conversations.lastMessageAt,
      peerJid: contacts.whatsappJid,
      displayName: contacts.displayName
    })
    .from(conversations)
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
    .limit(limit)
    .all();

  return rows.map((row) => {
    const latest = db
      .select({
        direction: messages.direction,
        type: messages.type,
        text: messages.text
      })
      .from(messages)
      .where(eq(messages.conversationId, row.id))
      .orderBy(desc(messages.timestamp), desc(messages.id))
      .limit(1)
      .get();

    return {
      id: row.id,
      type: row.type,
      title: resolveConversationTitle(
        row.title,
        row.displayName,
        row.peerJid ?? row.externalConversationId
      ),
      peerJid: row.type === "direct" ? row.peerJid : null,
      externalConversationId: row.externalConversationId,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: latest
        ? messagePreview(latest.type, latest.text)
        : null,
      lastMessageDirection: latest?.direction ?? null
    };
  });
}

export function getConversation(id: number): ConversationView | null {
  const row = db
    .select({
      id: conversations.id,
      type: conversations.type,
      title: conversations.title,
      externalConversationId: conversations.externalConversationId,
      peerJid: contacts.whatsappJid,
      displayName: contacts.displayName
    })
    .from(conversations)
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(eq(conversations.id, id))
    .get();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    type: row.type,
    title: resolveConversationTitle(
      row.title,
      row.displayName,
      row.peerJid ?? row.externalConversationId
    ),
    peerJid: row.type === "direct" ? row.peerJid : null,
    externalConversationId: row.externalConversationId
  };
}

export function listMessages(
  conversationId: number,
  limit = 50,
  before: { timestamp: number; id: number } | null = null
): MessagePage {
  const conversationType = db
    .select({ type: conversations.type })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get()?.type;
  const cursorCondition = before
    ? or(
        lt(messages.timestamp, new Date(before.timestamp)),
        and(
          eq(messages.timestamp, new Date(before.timestamp)),
          lt(messages.id, before.id)
        )
      )
    : undefined;

  const rows = db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      direction: messages.direction,
      origin: messages.origin,
      type: messages.type,
      text: messages.text,
      timestamp: messages.timestamp,
      quotedMessageId: messages.quotedMessageId
    })
    .from(messages)
    .where(
      cursorCondition
        ? and(eq(messages.conversationId, conversationId), cursorCondition)
        : eq(messages.conversationId, conversationId)
    )
    .orderBy(desc(messages.timestamp), desc(messages.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit).reverse();
  const views: MessageView[] = pageRows.map((row) => {
    const sender = row.senderId
      ? db
          .select({
            displayName: contacts.displayName,
            whatsappJid: contacts.whatsappJid
          })
          .from(contacts)
          .where(eq(contacts.id, row.senderId))
          .get()
      : undefined;
    const quoted = row.quotedMessageId
      ? db
          .select({ type: messages.type, text: messages.text })
          .from(messages)
          .where(eq(messages.id, row.quotedMessageId))
          .get()
      : undefined;

    return {
      id: row.id,
      direction: row.direction,
      origin: row.origin,
      type: row.type,
      text: row.text,
      timestamp: row.timestamp.toISOString(),
      senderLabel:
        conversationType === "group" && row.direction === "incoming" && sender
          ? sender.displayName?.trim() || formatJid(sender.whatsappJid)
          : null,
      quotedMessageId: row.quotedMessageId,
      quotedPreview: quoted ? messagePreview(quoted.type, quoted.text) : null
    };
  });
  const oldest = views[0];

  return {
    messages: views,
    hasMore,
    oldest: oldest ? { timestamp: oldest.timestamp, id: oldest.id } : null
  };
}
