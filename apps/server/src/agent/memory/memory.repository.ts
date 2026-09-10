import { and, asc, count, eq, gt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { conversations, memoryFacts, messages, type MemoryFactStatus } from "../../db/schema.js";
import type { MemoryFactRow, MemoryFactView } from "./memory.types.js";

const MAX_FACT_CHARS = 200;

function toRow(row: typeof memoryFacts.$inferSelect): MemoryFactRow {
  return {
    id: row.id,
    contactId: row.contactId,
    fact: row.fact,
    status: row.status,
    sourceMessageId: row.sourceMessageId,
    promptVersion: row.promptVersion,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime()
  };
}

export function toFactView(row: MemoryFactRow): MemoryFactView {
  return {
    id: row.id,
    fact: row.fact,
    status: row.status,
    sourceMessageId: row.sourceMessageId,
    createdAt: new Date(row.createdAt).toISOString()
  };
}

export function listFacts(
  contactId: number,
  status?: MemoryFactStatus
): MemoryFactRow[] {
  return db
    .select()
    .from(memoryFacts)
    .where(
      status
        ? and(eq(memoryFacts.contactId, contactId), eq(memoryFacts.status, status))
        : eq(memoryFacts.contactId, contactId)
    )
    .orderBy(asc(memoryFacts.createdAt), asc(memoryFacts.id))
    .all()
    .map(toRow);
}

export function countFacts(contactId: number): number {
  return (
    db
      .select({ value: count() })
      .from(memoryFacts)
      .where(eq(memoryFacts.contactId, contactId))
      .get()?.value ?? 0
  );
}

// Collisions are dropped silently, which is what stops a rejected fact coming back.
export function proposeFacts(input: {
  contactId: number;
  facts: string[];
  sourceMessageId: number;
  promptVersion: string;
}): number {
  let inserted = 0;

  for (const raw of input.facts) {
    const fact = raw.trim().slice(0, MAX_FACT_CHARS);

    if (!fact) {
      continue;
    }

    const result = db
      .insert(memoryFacts)
      .values({
        contactId: input.contactId,
        fact,
        status: "proposed",
        sourceMessageId: input.sourceMessageId,
        promptVersion: input.promptVersion
      })
      .onConflictDoNothing({
        target: [memoryFacts.contactId, memoryFacts.fact]
      })
      .run();

    inserted += result.changes;
  }

  return inserted;
}

export function setFactStatus(
  contactId: number,
  factId: number,
  status: MemoryFactStatus
): MemoryFactRow | null {
  db.update(memoryFacts)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(memoryFacts.id, factId), eq(memoryFacts.contactId, contactId)))
    .run();

  const row = db
    .select()
    .from(memoryFacts)
    .where(and(eq(memoryFacts.id, factId), eq(memoryFacts.contactId, contactId)))
    .get();

  return row ? toRow(row) : null;
}

export function deleteFact(contactId: number, factId: number): boolean {
  const result = db
    .delete(memoryFacts)
    .where(and(eq(memoryFacts.id, factId), eq(memoryFacts.contactId, contactId)))
    .run();

  return result.changes > 0;
}

export function countMessagesSinceLastExtraction(conversationId: number): number {
  const lastId =
    db
      .select({ value: conversations.lastMemoryMessageId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .get()?.value ?? 0;

  return (
    db
      .select({ value: count() })
      .from(messages)
      .where(
        and(eq(messages.conversationId, conversationId), gt(messages.id, lastId))
      )
      .get()?.value ?? 0
  );
}

export function markExtractionRun(conversationId: number, messageId: number): void {
  db.update(conversations)
    .set({ lastMemoryMessageId: messageId })
    .where(eq(conversations.id, conversationId))
    .run();
}
