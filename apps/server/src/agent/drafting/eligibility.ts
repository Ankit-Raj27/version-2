import type {
  ConversationType,
  MessageDirection,
  NormalizedMessageType,
  PersistOutcome
} from "../../messaging/message.types.js";

const MAX_TEXT_LENGTH = 4000;
const RECENCY_WINDOW_MS = 10 * 60 * 1000;

export type IneligibleReason =
  | "drafting_disabled"
  | "not_inserted"
  | "outgoing"
  | "not_text"
  | "empty_text"
  | "text_too_long"
  | "not_direct"
  | "no_contact"
  | "not_allowlisted"
  | "message_too_old";

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: IneligibleReason };

export interface EligibilityInput {
  draftingEnabled: boolean;
  persistOutcome: PersistOutcome;
  direction: MessageDirection;
  type: NormalizedMessageType;
  text: string | null;
  conversationType: ConversationType;
  contactId: number | null;
  peerJid: string | null;
  allowedJids: string[];
  messageTimestamp: number;
  now: number;
}

function ineligible(reason: IneligibleReason): EligibilityResult {
  return { eligible: false, reason };
}

export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  if (!input.draftingEnabled) {
    return ineligible("drafting_disabled");
  }

  if (input.persistOutcome !== "inserted") {
    return ineligible("not_inserted");
  }

  if (input.direction !== "incoming") {
    return ineligible("outgoing");
  }

  if (input.type !== "text") {
    return ineligible("not_text");
  }

  const trimmedText = input.text?.trim() ?? "";

  if (trimmedText.length === 0) {
    return ineligible("empty_text");
  }

  if (trimmedText.length > MAX_TEXT_LENGTH) {
    return ineligible("text_too_long");
  }

  if (input.conversationType !== "direct") {
    return ineligible("not_direct");
  }

  if (input.contactId === null) {
    return ineligible("no_contact");
  }

  if (
    input.allowedJids.length > 0 &&
    (input.peerJid === null || !input.allowedJids.includes(input.peerJid))
  ) {
    return ineligible("not_allowlisted");
  }

  if (input.now - input.messageTimestamp > RECENCY_WINDOW_MS) {
    return ineligible("message_too_old");
  }

  return { eligible: true };
}
