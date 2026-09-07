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

  // ── reserved extension points — absent in Phase 4, do not populate ──
  // style?:   StyleProfile      (Phase 8)
  // memory?:  MemoryFact[]      (Phase 9)
  // summary?: string            (Phase 9)
  // risk?:    RiskAssessment    (Phase 10)
}
