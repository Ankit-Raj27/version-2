import { and, desc, eq, inArray, lt } from "drizzle-orm";
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
    finalText: row.finalText,
    sentMessageId: row.sentMessageId,
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

/**
 * drizzle-orm 0.45's onConflictDoNothing({ where }) emits `do nothing where <expr>`, which
 * is invalid SQLite grammar (only the conflict target itself, or DO UPDATE SET, may carry a
 * WHERE) — it cannot target a partial unique index like drafts_trigger_active_uq. Catching
 * the resulting SQLITE_CONSTRAINT_UNIQUE is the workaround.
 */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

/** INSERT status='generating', null if a live draft already exists for this trigger message. */
export function reserveDraft(input: {
  conversationId: number;
  triggerMessageId: number;
  promptVersion: string;
}): DraftRow | null {
  const now = new Date();
  let insertedId: number;

  try {
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
      .run();

    insertedId = Number(result.lastInsertRowid);
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return null;
    }

    throw err;
  }

  const row = db.select().from(drafts).where(eq(drafts.id, insertedId)).get();

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

export function getDraftById(id: number): DraftRow | null {
  const row = db.select().from(drafts).where(eq(drafts.id, id)).get();
  return row ? toDraftRow(row) : null;
}

/** Conditional ready -> sending. Stores the text actually being sent. Returns null if the draft was not 'ready' (race lost or wrong state). */
export function reserveSend(id: number, finalText: string): DraftRow | null {
  const result = db
    .update(drafts)
    .set({ status: "sending", finalText, updatedAt: new Date() })
    .where(and(eq(drafts.id, id), eq(drafts.status, "ready")))
    .run();

  if (result.changes === 0) {
    return null;
  }

  return getDraftById(id);
}

/** Conditional sending -> sent. Clears any prior send-failure error info. */
export function markSent(id: number, sentMessageId: number | null): DraftRow | null {
  const result = db
    .update(drafts)
    .set({
      status: "sent",
      sentMessageId,
      errorKind: null,
      errorMessage: null,
      updatedAt: new Date()
    })
    .where(and(eq(drafts.id, id), eq(drafts.status, "sending")))
    .run();

  if (result.changes === 0) {
    return null;
  }

  return getDraftById(id);
}

/** Conditional sending -> ready, recording why the send failed so the draft stays retryable. */
export function revertSendFailure(
  id: number,
  input: { errorKind: string; errorMessage: string }
): DraftRow | null {
  const result = db
    .update(drafts)
    .set({
      status: "ready",
      errorKind: input.errorKind,
      errorMessage: input.errorMessage.slice(0, 500),
      updatedAt: new Date()
    })
    .where(and(eq(drafts.id, id), eq(drafts.status, "sending")))
    .run();

  if (result.changes === 0) {
    return null;
  }

  return getDraftById(id);
}

/** Conditional ready -> ignored. Returns false if the draft was not 'ready'. */
export function markIgnored(id: number): boolean {
  const result = db
    .update(drafts)
    .set({ status: "ignored", updatedAt: new Date() })
    .where(and(eq(drafts.id, id), eq(drafts.status, "ready")))
    .run();

  return result.changes > 0;
}

/** Conditional transition to 'superseded' from one of the given source statuses. */
export function markSuperseded(id: number, fromStatuses: DraftStatus[]): boolean {
  const result = db
    .update(drafts)
    .set({ status: "superseded", updatedAt: new Date() })
    .where(and(eq(drafts.id, id), inArray(drafts.status, fromStatuses)))
    .run();

  return result.changes > 0;
}

/**
 * Regenerate: atomically supersedes the current draft (if still in an allowed source
 * status) and reserves a fresh 'generating' row for the same trigger. Returns null if the
 * old draft could not be superseded (already acted on elsewhere — race lost).
 */
export function insertRegeneratedDraft(input: {
  oldDraftId: number;
  fromStatuses: DraftStatus[];
  conversationId: number;
  triggerMessageId: number;
  promptVersion: string;
}): DraftRow | null {
  return db.transaction((tx) => {
    const now = new Date();
    const supersedeResult = tx
      .update(drafts)
      .set({ status: "superseded", updatedAt: now })
      .where(
        and(eq(drafts.id, input.oldDraftId), inArray(drafts.status, input.fromStatuses))
      )
      .run();

    if (supersedeResult.changes === 0) {
      return null;
    }

    const insertResult = tx
      .insert(drafts)
      .values({
        conversationId: input.conversationId,
        triggerMessageId: input.triggerMessageId,
        status: "generating",
        promptVersion: input.promptVersion,
        createdAt: now,
        updatedAt: now
      })
      .run();

    const row = tx
      .select()
      .from(drafts)
      .where(eq(drafts.id, Number(insertResult.lastInsertRowid)))
      .get();

    return row ? toDraftRow(row) : null;
  });
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

/**
 * Startup sweep: a draft stuck in 'sending' past the cutoff means the process crashed
 * between reserving the send and confirming its outcome. Whether the WhatsApp message
 * actually went out is unknowable from the DB alone, so this fails closed — the draft is
 * marked 'failed' rather than reverted to 'ready', so a stale reservation can never be
 * silently retried into a possible duplicate send. Returns the count swept.
 */
export function expireStaleSending(olderThanMs: number): number {
  const cutoff = new Date(Date.now() - olderThanMs);
  const result = db
    .update(drafts)
    .set({
      status: "failed",
      errorKind: "interrupted",
      errorMessage: "Send was interrupted by a server restart; verify WhatsApp before retrying",
      updatedAt: new Date()
    })
    .where(and(eq(drafts.status, "sending"), lt(drafts.updatedAt, cutoff)))
    .run();

  return result.changes;
}
