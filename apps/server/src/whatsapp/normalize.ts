import {
  getContentType,
  isJidGroup,
  jidNormalizedUser,
  normalizeMessageContent,
  type WAContextInfo,
  type WAMessage,
  type WAMessageContent
} from "@whiskeysockets/baileys";
import type {
  NormalizedMessage,
  NormalizedMessageMetadata,
  NormalizedParty,
  NormalizedQuote
} from "../messaging/message.types.js";

const ignoredContentTypes = new Set([
  "protocolMessage",
  "reactionMessage",
  "senderKeyDistributionMessage"
]);

function normalizeJid(jid: string | null | undefined): string | null {
  const trimmed = jid?.trim();
  return trimmed ? jidNormalizedUser(trimmed) : null;
}

function makeParty(
  jid: string,
  altJid?: string | null,
  displayName?: string | null
): NormalizedParty {
  const party: NormalizedParty = { jid };

  if (altJid && altJid !== jid) {
    party.altJid = altJid;
  }

  if (displayName) {
    party.displayName = displayName;
  }

  return party;
}

function getWrapperMetadata(content: WAMessageContent): {
  ephemeral: boolean;
  viewOnce: boolean;
} {
  let current: unknown = content;
  let ephemeral = false;
  let viewOnce = false;

  while (current && typeof current === "object") {
    const record = current as Record<string, unknown>;
    const ephemeralMessage = record.ephemeralMessage as
      | { message?: unknown }
      | undefined;

    if (ephemeralMessage?.message) {
      ephemeral = true;
      current = ephemeralMessage.message;
      continue;
    }

    const viewOnceMessage = (
      record.viewOnceMessage ??
      record.viewOnceMessageV2 ??
      record.viewOnceMessageV2Extension
    ) as { message?: unknown } | undefined;

    if (viewOnceMessage?.message) {
      viewOnce = true;
      current = viewOnceMessage.message;
      continue;
    }

    break;
  }

  return { ephemeral, viewOnce };
}

function getContextInfo(
  content: WAMessageContent,
  contentType: keyof WAMessageContent
): WAContextInfo | null {
  const node = content[contentType] as
    | { contextInfo?: WAContextInfo | null }
    | null
    | undefined;

  return node && typeof node === "object"
    ? (node.contextInfo ?? null)
    : null;
}

function normalizeQuote(contextInfo: WAContextInfo | null): NormalizedQuote | null {
  const externalMessageId = contextInfo?.stanzaId?.trim();

  if (!externalMessageId) {
    return null;
  }

  const quote: NormalizedQuote = { externalMessageId };
  const authorJid = normalizeJid(contextInfo?.participant);

  if (authorJid) {
    quote.authorJid = authorJid;
  }

  return quote;
}

function normalizeTimestamp(timestamp: WAMessage["messageTimestamp"]): {
  timestamp: number;
  timestampWasSynthesized: boolean;
} {
  const seconds =
    typeof timestamp === "number"
      ? timestamp
      : timestamp && typeof timestamp.toNumber === "function"
        ? timestamp.toNumber()
        : Number.NaN;

  if (!Number.isFinite(seconds)) {
    return {
      timestamp: Date.now(),
      timestampWasSynthesized: true
    };
  }

  return {
    timestamp: seconds * 1_000,
    timestampWasSynthesized: false
  };
}

export function normalizeWhatsAppMessage(
  message: WAMessage
): NormalizedMessage | null {
  try {
    const key = message?.key;
    const externalMessageId = key?.id?.trim();
    const rawRemoteJid = key?.remoteJid?.trim();

    if (!externalMessageId || !rawRemoteJid || !message.message) {
      return null;
    }

    const conversationType = isJidGroup(rawRemoteJid) ? "group" : "direct";
    const externalConversationId =
      conversationType === "group"
        ? rawRemoteJid
        : normalizeJid(rawRemoteJid);

    if (!externalConversationId) {
      return null;
    }

    const wrapperMetadata = getWrapperMetadata(message.message);
    const content = normalizeMessageContent(message.message);
    const contentType = getContentType(content);

    if (!content || !contentType || ignoredContentTypes.has(contentType)) {
      return null;
    }

    let text: string | null = null;
    let type: NormalizedMessage["type"] = "unsupported";

    if (contentType === "conversation") {
      const value = content.conversation;
      text = typeof value === "string" ? value.trim() : null;
      type = "text";
    } else if (contentType === "extendedTextMessage") {
      const value = content.extendedTextMessage?.text;
      text = typeof value === "string" ? value.trim() : null;
      type = "text";
    }

    if (type === "text" && !text) {
      return null;
    }

    const rawRemoteJidAlt = key.remoteJidAlt?.trim();
    const remoteJidAlt = normalizeJid(rawRemoteJidAlt);
    const rawParticipant = key.participant?.trim();
    const participantJid = normalizeJid(rawParticipant);
    const rawParticipantAlt = key.participantAlt?.trim();
    const participantAltJid = normalizeJid(rawParticipantAlt);
    const displayName = message.pushName?.trim() || null;
    const direction = key.fromMe ? "outgoing" : "incoming";

    const conversationPeer =
      conversationType === "direct"
        ? makeParty(
            externalConversationId,
            remoteJidAlt,
            direction === "incoming" ? displayName : null
          )
        : null;

    const sender =
      direction === "outgoing"
        ? null
        : conversationType === "group"
          ? participantJid
            ? makeParty(participantJid, participantAltJid, displayName)
            : null
          : conversationPeer;

    const metadata: NormalizedMessageMetadata = { rawRemoteJid };

    if (rawRemoteJidAlt) metadata.rawRemoteJidAlt = rawRemoteJidAlt;
    if (rawParticipant) metadata.rawParticipant = rawParticipant;
    if (rawParticipantAlt) metadata.rawParticipantAlt = rawParticipantAlt;
    if (key.addressingMode) metadata.addressingMode = key.addressingMode;
    metadata.baileysContentType = contentType;
    if (displayName) metadata.pushName = displayName;
    if (wrapperMetadata.ephemeral) metadata.ephemeral = true;
    if (wrapperMetadata.viewOnce) metadata.viewOnce = true;

    const time = normalizeTimestamp(message.messageTimestamp);
    const contextInfo = getContextInfo(content, contentType);

    return {
      externalMessageId,
      externalConversationId,
      conversationType,
      sender,
      conversationPeer,
      direction,
      origin: direction === "outgoing" ? "USER_PHONE" : "CONTACT",
      type,
      text,
      quote: normalizeQuote(contextInfo),
      timestamp: time.timestamp,
      timestampWasSynthesized: time.timestampWasSynthesized,
      metadata
    };
  } catch {
    return null;
  }
}
