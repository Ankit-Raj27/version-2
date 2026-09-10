import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { contacts, conversations, type Relationship, type ReplyMode } from "../db/schema.js";
import { normalizeRelationship } from "../agent/policies/contact-policy.js";

/** Public DTO for a contact's editable policy fields. Internal columns (altJid,
 * styleProfile, timestamps, ids beyond `id`) are deliberately omitted. */
export interface ContactView {
  id: number;
  whatsappJid: string;
  displayName: string | null;
  relationship: Relationship;
  replyMode: ReplyMode;
  notes: string | null;
}

/** Only these fields may be changed through the contact API. An absent key is left
 * untouched; `notes: null` clears the note. */
export interface ContactSettingsPatch {
  displayName?: string | undefined;
  relationship?: Relationship | undefined;
  replyMode?: ReplyMode | undefined;
  notes?: string | null | undefined;
}

function toContactView(row: typeof contacts.$inferSelect): ContactView {
  return {
    id: row.id,
    whatsappJid: row.whatsappJid,
    displayName: row.displayName,
    relationship: normalizeRelationship(row.relationship),
    replyMode: row.replyMode,
    notes: row.notes
  };
}

export function getContactById(id: number): ContactView | null {
  const row = db.select().from(contacts).where(eq(contacts.id, id)).get();
  return row ? toContactView(row) : null;
}

/** The contact behind a direct conversation, or null (missing conversation or a group). */
export function getContactByConversation(conversationId: number): ContactView | null {
  const row = db
    .select()
    .from(contacts)
    .innerJoin(conversations, eq(conversations.contactId, contacts.id))
    .where(eq(conversations.id, conversationId))
    .get();
  return row ? toContactView(row.contacts) : null;
}

/**
 * Applies a scoped patch to a contact's editable fields. Keys absent from `patch` are
 * left untouched; `notes: null` explicitly clears the note. Returns the updated view, or
 * null if the contact does not exist.
 */
export function updateContactSettings(
  id: number,
  patch: ContactSettingsPatch
): ContactView | null {
  const existing = db.select().from(contacts).where(eq(contacts.id, id)).get();

  if (!existing) {
    return null;
  }

  const set: Partial<typeof contacts.$inferInsert> = { updatedAt: new Date() };

  if (patch.displayName !== undefined) set.displayName = patch.displayName;
  if (patch.relationship !== undefined) set.relationship = patch.relationship;
  if (patch.replyMode !== undefined) set.replyMode = patch.replyMode;
  if (patch.notes !== undefined) set.notes = patch.notes;

  db.update(contacts).set(set).where(eq(contacts.id, id)).run();

  return getContactById(id);
}
