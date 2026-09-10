import {
  getConversationContact,
  getOutgoingTextSamples,
  getRecentMessagesForContext,
  getStyleExemplars,
  type ContextMessageRow,
  type StyleExemplar
} from "../../messaging/queries.js";
import { listFacts } from "../memory/memory.repository.js";
import type { ContextMessage, DraftContext, StyleSnapshot } from "./context.types.js";

const PER_MESSAGE_CHAR_LIMIT = 1000;
const TOTAL_CHAR_BUDGET = 6000;

const STYLE_SAMPLE_LIMIT = 200;
const EXEMPLAR_TARGET = 12;
/** Below this a median and emoji ratio are noise; omit the snapshot instead. */
const MIN_STYLE_SAMPLES = 5;

const EMOJI = /\p{Extended_Pictographic}/u;

const CONTENT_TYPE_PLACEHOLDERS: Record<string, string> = {
  imageMessage: "[image]",
  videoMessage: "[video]",
  audioMessage: "[voice note]",
  documentMessage: "[document]",
  stickerMessage: "[sticker]",
  contactMessage: "[contact card]",
  locationMessage: "[location]"
};

function renderText(row: ContextMessageRow): string {
  if (row.type === "text") {
    const text = row.text ?? "";
    return text.length > PER_MESSAGE_CHAR_LIMIT
      ? `${text.slice(0, PER_MESSAGE_CHAR_LIMIT)}…`
      : text;
  }

  return row.baileysContentType
    ? (CONTENT_TYPE_PLACEHOLDERS[row.baileysContentType] ?? "[unsupported message]")
    : "[unsupported message]";
}

function toContextMessage(row: ContextMessageRow): ContextMessage {
  return {
    id: row.id,
    direction: row.direction,
    type: row.type,
    text: renderText(row),
    timestamp: row.timestamp,
    quotedText: row.quotedText,
    quotedUnresolved: row.hasUnresolvedQuote
  };
}

function messageLength(message: ContextMessage): number {
  return (message.text?.length ?? 0) + (message.quotedText?.length ?? 0);
}

/**
 * Drops from the oldest end until the transcript fits TOTAL_CHAR_BUDGET,
 * always keeping the trigger (last) message.
 */
function applyCharBudget(messages: ContextMessage[]): {
  messages: ContextMessage[];
  truncated: boolean;
} {
  let total = messages.reduce((sum, message) => sum + messageLength(message), 0);
  let truncated = false;
  const result = [...messages];

  while (total > TOTAL_CHAR_BUDGET && result.length > 1) {
    const dropped = result.shift();
    total -= dropped ? messageLength(dropped) : 0;
    truncated = true;
  }

  return { messages: result, truncated };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

function buildStyleSnapshot(conversationId: number): StyleSnapshot | undefined {
  const samples = getOutgoingTextSamples(conversationId, STYLE_SAMPLE_LIMIT);

  if (samples.length < MIN_STYLE_SAMPLES) {
    return undefined;
  }

  return {
    sampleCount: samples.length,
    medianChars: median(samples.map((text) => text.length)),
    emojiRatio: samples.filter((text) => EMOJI.test(text)).length / samples.length
  };
}

/** Prefers this contact's own exchanges, topped up from elsewhere when it is thin. */
function buildExemplars(conversationId: number): StyleExemplar[] {
  const own = getStyleExemplars(conversationId, EXEMPLAR_TARGET);

  if (own.length >= EXEMPLAR_TARGET) {
    return own;
  }

  const seen = new Set(own.map((exemplar) => exemplar.reply));
  const filler = getStyleExemplars(null, EXEMPLAR_TARGET * 3)
    .filter((exemplar) => !seen.has(exemplar.reply))
    .slice(-(EXEMPLAR_TARGET - own.length));

  return [...filler, ...own];
}

export function buildDraftContext(
  conversationId: number,
  triggerMessageId: number,
  requestedLimit: number
): DraftContext {
  const contact = getConversationContact(conversationId);

  if (!contact) {
    throw new Error(
      `Cannot build draft context: conversation ${conversationId} has no resolvable direct contact`
    );
  }

  const rows = getRecentMessagesForContext(conversationId, requestedLimit);
  const contextMessages = rows.map(toContextMessage);

  let triggerMessage = contextMessages.find((message) => message.id === triggerMessageId);

  if (!triggerMessage) {
    const triggerRow = getRecentMessagesForContext(conversationId, 1).find(
      (row) => row.id === triggerMessageId
    );
    triggerMessage = triggerRow
      ? toContextMessage(triggerRow)
      : contextMessages.at(-1);
  }

  if (!triggerMessage) {
    throw new Error(
      `Cannot build draft context: trigger message ${triggerMessageId} not found`
    );
  }

  const { messages: budgeted, truncated } = applyCharBudget(contextMessages);

  return {
    contact: {
      displayName: contact.displayName,
      jid: contact.jid,
      relationship: contact.relationship,
      notes: contact.notes
    },
    conversation: {
      id: conversationId,
      type: "direct"
    },
    recentMessages: budgeted,
    triggerMessage,
    style: buildStyleSnapshot(conversationId),
    memory: listFacts(contact.contactId, "confirmed").map((row) => row.fact),
    exemplars: buildExemplars(conversationId),
    meta: {
      requestedLimit,
      includedCount: budgeted.length,
      truncated
    }
  };
}
