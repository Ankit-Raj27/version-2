import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { drafts } from "../../db/schema.js";
import type { AiErrorKind } from "../../ai/errors.js";
import type { AiTokenUsage } from "../../ai/ai.types.js";
import type { DraftRow, DraftStatus } from "./draft.types.js";

function toDraftRow(row: typeof drafts.$inferSelect): DraftRow {
  return {
    id: row.id,
    conversationId: row.conversationId,
    triggerMessageId: row.triggerMessageId,
    status: row.status as DraftStatus,
    generatedText: row.generatedText,
    model: row.model,
    promptVersion: row.promptVersion,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    reasoningTokens: row.reasoningTokens,
    cachedInputTokens: row.cachedInputTokens,
    latencyMs: row.latencyMs,
    contextMessageCount: row.contextMessageCount,
    errorKind: row.errorKind,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/** INSERT status='generating' ON CONFLICT DO NOTHING. null means a draft already exists for this message. */
export function reserveDraft(input: {
  conversationId: number;
  triggerMessageId: number;
  promptVersion: string;
}): DraftRow | null {
  const now = new Date();
  const result = db
    .insert(drafts)
    .values({
      conversationId: input.conversationId,
      triggerMessageId: input.triggerMessageId,
      status: "generating",
      promptVersion: input.promptVersion,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoNothing({ target: drafts.triggerMessageId })
    .run();

  if (result.changes === 0) {
    return null;
  }

  const row = db
    .select()
    .from(drafts)
    .where(eq(drafts.id, Number(result.lastInsertRowid)))
    .get();

  return row ? toDraftRow(row) : null;
}

export function completeDraft(
  id: number,
  input: {
    generatedText: string;
    model: string;
    usage: AiTokenUsage;
    latencyMs: number;
    contextMessageCount: number;
  }
): void {
  db.update(drafts)
    .set({
      status: "ready",
      generatedText: input.generatedText,
      model: input.model,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      totalTokens: input.usage.totalTokens,
      reasoningTokens: input.usage.reasoningTokens,
      cachedInputTokens: input.usage.cachedInputTokens,
      latencyMs: input.latencyMs,
      contextMessageCount: input.contextMessageCount,
      updatedAt: new Date()
    })
    .where(eq(drafts.id, id))
    .run();
}

export function failDraft(
  id: number,
  input: { errorKind: AiErrorKind; errorMessage: string; latencyMs?: number }
): void {
  db.update(drafts)
    .set({
      status: "failed",
      errorKind: input.errorKind,
      errorMessage: input.errorMessage.slice(0, 500),
      latencyMs: input.latencyMs ?? null,
      updatedAt: new Date()
    })
    .where(eq(drafts.id, id))
    .run();
}

export function getLatestDraftForConversation(conversationId: number): DraftRow | null {
  const row = db
    .select()
    .from(drafts)
    .where(eq(drafts.conversationId, conversationId))
    .orderBy(desc(drafts.createdAt), desc(drafts.id))
    .limit(1)
    .get();

  return row ? toDraftRow(row) : null;
}

/** Startup sweep: marks orphaned 'generating' rows (crash/Ctrl-C mid-generation) as failed. Returns the count swept. */
export function expireStaleGenerating(olderThanMs: number): number {
  const cutoff = new Date(Date.now() - olderThanMs);
  const result = db
    .update(drafts)
    .set({
      status: "failed",
      errorKind: "interrupted",
      errorMessage: "Draft generation was interrupted by a server restart",
      updatedAt: new Date()
    })
    .where(and(eq(drafts.status, "generating"), lt(drafts.createdAt, cutoff)))
    .run();

  return result.changes;
}
