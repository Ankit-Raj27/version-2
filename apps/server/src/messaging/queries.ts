import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { contacts, conversations, messages } from "../db/schema.js";
import { formatJid, resolveConversationTitle } from "./display.js";
import type { MessageDirection, MessageOrigin, NormalizedMessageType } from "./message.types.js";
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

export interface ConversationContactInfo {
  contactId: number;
  jid: string;
  displayName: string | null;
  relationship: string | null;
  replyMode: string;
  notes: string | null;
}

export function getConversationContact(
  conversationId: number
): ConversationContactInfo | null {
  const row = db
    .select({
      contactId: contacts.id,
      jid: contacts.whatsappJid,
      displayName: contacts.displayName,
      relationship: contacts.relationship,
      replyMode: contacts.replyMode,
      notes: contacts.notes
    })
    .from(conversations)
    .innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(eq(conversations.id, conversationId))
    .get();

  return row ?? null;
}

export interface ContextMessageRow {
  id: number;
  direction: MessageDirection;
  type: NormalizedMessageType;
  text: string | null;
  timestamp: number;
  quotedText: string | null;
  hasUnresolvedQuote: boolean;
  baileysContentType: string | null;
}

/**
 * Bounded by SQL LIMIT, not filtered in JS afterward — full history is never
 * fetched, only the most recent `limit` rows. Returned oldest-first.
 */
export function getRecentMessagesForContext(
  conversationId: number,
  limit: number
): ContextMessageRow[] {
  const rows = db
    .select({
      id: messages.id,
      direction: messages.direction,
      type: messages.type,
      text: messages.text,
      timestamp: messages.timestamp,
      quotedMessageId: messages.quotedMessageId,
      quotedExternalMessageId: messages.quotedExternalMessageId,
      metadata: messages.metadata
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.timestamp), desc(messages.id))
    .limit(limit)
    .all();

  return rows
    .map((row) => {
      const quoted = row.quotedMessageId
        ? db
            .select({ type: messages.type, text: messages.text })
            .from(messages)
            .where(eq(messages.id, row.quotedMessageId))
            .get()
        : undefined;
      const metadata = row.metadata as { baileysContentType?: string } | null;

      return {
        id: row.id,
        direction: row.direction,
        type: row.type,
        text: row.text,
        timestamp: row.timestamp.getTime(),
        quotedText: quoted ? messagePreview(quoted.type, quoted.text) : null,
        hasUnresolvedQuote: row.quotedMessageId === null && row.quotedExternalMessageId !== null,
        baileysContentType: metadata?.baileysContentType ?? null
      };
    })
    .reverse();
}

export interface MessageIdentity {
  id: number;
  conversationId: number;
  timestamp: number;
}

export function getMessageById(id: number): MessageIdentity | null {
  const row = db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      timestamp: messages.timestamp
    })
    .from(messages)
    .where(eq(messages.id, id))
    .get();

  return row ? { id: row.id, conversationId: row.conversationId, timestamp: row.timestamp.getTime() } : null;
}

export interface MessageAfterCursor {
  id: number;
  direction: MessageDirection;
  origin: MessageOrigin;
  timestamp: number;
}

/**
 * The earliest message strictly after the given (timestamp, id) cursor, or null if the
 * trigger is still the most recent message. Used by draft-sendability to detect that the
 * conversation has moved on (a newer incoming message, a manual phone reply, or another
 * approved AI reply) since a draft's trigger message.
 */
export function findMessageAfter(
  conversationId: number,
  after: { timestamp: number; id: number }
): MessageAfterCursor | null {
  const afterTimestamp = new Date(after.timestamp);
  const row = db
    .select({
      id: messages.id,
      direction: messages.direction,
      origin: messages.origin,
      timestamp: messages.timestamp
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        or(
          gt(messages.timestamp, afterTimestamp),
          and(eq(messages.timestamp, afterTimestamp), gt(messages.id, after.id))
        )
      )
    )
    .orderBy(asc(messages.timestamp), asc(messages.id))
    .limit(1)
    .get();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    direction: row.direction,
    origin: row.origin,
    timestamp: row.timestamp.getTime()
  };
}
