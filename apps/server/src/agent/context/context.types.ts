export interface ContextMessage {
  id: number;
  direction: "incoming" | "outgoing";
  /** 'text' | 'unsupported' — placeholder rendering depends on it */
  type: string;
  text: string | null;
  timestamp: number;
  /** resolved quoted text when quotedMessageId points at a local row */
  quotedText: string | null;
  /** true when the message quoted something that could not be resolved locally */
  quotedUnresolved: boolean;
}

import type { StyleExemplar } from "../../messaging/queries.js";

export type { StyleExemplar };

/**
 * Measured from the user's own past replies in this conversation — habits the bounded
 * transcript is too short to show reliably. Absent when there are too few samples to
 * say anything honest.
 */
export interface StyleSnapshot {
  sampleCount: number;
  medianChars: number;
  /** fraction of sampled replies containing at least one emoji, 0–1 */
  emojiRatio: number;
}

export interface DraftContext {
  contact: {
    displayName: string | null;
    jid: string;
    relationship: string | null;
    notes: string | null;
  };
  conversation: {
    id: number;
    type: "direct";
  };
  /** oldest → newest. Includes the trigger message as the final element. */
  recentMessages: ContextMessage[];
  triggerMessage: ContextMessage;
  meta: {
    requestedLimit: number;
    includedCount: number;
    truncated: boolean;
  };

  /** Phase 8. Absent when the conversation has too little outgoing history to measure. */
  style?: StyleSnapshot | undefined;

  /** Phase 9. Confirmed facts only — proposed and rejected ones never reach a prompt. */
  memory?: string[] | undefined;

  /** Phase 10. Real messages the user wrote, shown to the model as imitation targets. */
  exemplars?: StyleExemplar[] | undefined;

  // ── reserved extension points — do not populate ──
  // summary?: string            (Phase 9, deferred)
  // risk?:    RiskAssessment    (Phase 10)
}
