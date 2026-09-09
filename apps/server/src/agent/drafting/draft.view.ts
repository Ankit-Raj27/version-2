import { checkDraftSendability, type StaleReason } from "./draft-sendability.js";
import type { DraftRow, DraftStatus } from "./draft.types.js";

export interface DraftView {
  id: number;
  status: DraftStatus;
  generatedText: string | null;
  finalText: string | null;
  model: string | null;
  promptVersion: string;
  latencyMs: number | null;
  errorKind: string | null;
  createdAt: string;
  sendable: boolean;
  staleReason: StaleReason | null;
}

/**
 * The public DTO for a draft. Deliberately omits errorMessage (may carry raw
 * provider/transport error text) and internal bookkeeping (conversationId,
 * triggerMessageId, token counts, updatedAt, sentMessageId).
 */
export function toDraftView(draft: DraftRow): DraftView {
  const sendability = draft.status === "ready" ? checkDraftSendability(draft) : null;

  return {
    id: draft.id,
    status: draft.status,
    generatedText: draft.generatedText,
    finalText: draft.finalText,
    model: draft.model,
    promptVersion: draft.promptVersion,
    latencyMs: draft.latencyMs,
    errorKind: draft.errorKind,
    createdAt: draft.createdAt.toISOString(),
    sendable: sendability?.sendable ?? false,
    staleReason: sendability && !sendability.sendable ? sendability.reason : null
  };
}
