export type DraftStatus =
  | "generating"
  | "ready"
  | "sending"
  | "sent"
  | "failed"
  | "ignored"
  | "superseded";

export interface DraftRow {
  id: number;
  conversationId: number;
  triggerMessageId: number;
  status: DraftStatus;
  generatedText: string | null;
  finalText: string | null;
  sentMessageId: number | null;
  model: string | null;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  latencyMs: number | null;
  contextMessageCount: number | null;
  errorKind: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}
