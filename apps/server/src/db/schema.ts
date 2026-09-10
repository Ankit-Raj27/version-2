import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn
} from "drizzle-orm/sqlite-core";

// Single source of truth for contact-policy enum values (Phase 7). The dashboard mirrors
// these in apps/dashboard/lib/types.ts, matching the existing wire-contract convention.
// Casing is uppercase to match the pre-existing reply_mode column values.
export const RELATIONSHIPS = [
  "UNKNOWN",
  "FAMILY",
  "FRIEND",
  "WORK",
  "ACQUAINTANCE",
  "OTHER"
] as const;

export const REPLY_MODES = ["OFF", "DRAFT", "AUTO_SAFE", "AUTO"] as const;

export const MEMORY_FACT_STATUSES = ["proposed", "confirmed", "rejected"] as const;

export type Relationship = (typeof RELATIONSHIPS)[number];
export type ReplyMode = (typeof REPLY_MODES)[number];
export type MemoryFactStatus = (typeof MEMORY_FACT_STATUSES)[number];

export const appMetadata = sqliteTable("app_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
});

export const contacts = sqliteTable(
  "contacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    whatsappJid: text("whatsapp_jid").notNull(),
    altJid: text("alt_jid"),
    displayName: text("display_name"),
    // Nullable at the DB level (legacy rows predate Phase 7); migration 0004 backfills
    // NULL/unrecognised values to 'UNKNOWN' and new contacts are written 'UNKNOWN'
    // explicitly. The contact policy treats null/unknown as UNKNOWN (fail-closed).
    relationship: text("relationship", { enum: RELATIONSHIPS }),
    replyMode: text("reply_mode", { enum: REPLY_MODES }).notNull().default("OFF"),
    notes: text("notes"),
    styleProfile: text("style_profile", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (table) => [
    uniqueIndex("contacts_whatsapp_jid_uq").on(table.whatsappJid),
    index("contacts_alt_jid_idx").on(table.altJid)
  ]
);

export const conversations = sqliteTable(
  "conversations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    externalConversationId: text("external_conversation_id").notNull(),
    contactId: integer("contact_id").references(() => contacts.id, {
      onDelete: "set null"
    }),
    type: text("type", { enum: ["direct", "group"] }).notNull(),
    title: text("title"),
    summary: text("summary"),
    lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
    // Highest message id seen by the last memory extraction; drives the rate limit.
    lastMemoryMessageId: integer("last_memory_message_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (table) => [
    uniqueIndex("conversations_external_id_uq").on(
      table.externalConversationId
    ),
    index("conversations_last_message_at_idx").on(table.lastMessageAt)
  ]
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    externalMessageId: text("external_message_id").notNull(),
    senderId: integer("sender_id").references(() => contacts.id, {
      onDelete: "set null"
    }),
    direction: text("direction", {
      enum: ["incoming", "outgoing"]
    }).notNull(),
    type: text("type", { enum: ["text", "unsupported"] }).notNull(),
    text: text("text"),
    origin: text("origin", {
      enum: [
        "CONTACT",
        "USER_PHONE",
        "AI_APPROVED",
        "AI_EDITED",
        "AI_AUTO",
        "SYSTEM"
      ]
    }).notNull(),
    quotedExternalMessageId: text("quoted_external_message_id"),
    quotedMessageId: integer("quoted_message_id").references(
      (): AnySQLiteColumn => messages.id,
      { onDelete: "set null" }
    ),
    timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (table) => [
    uniqueIndex("messages_conv_ext_uq").on(
      table.conversationId,
      table.externalMessageId
    ),
    index("messages_conversation_timestamp_idx").on(
      table.conversationId,
      table.timestamp
    )
  ]
);

export const drafts = sqliteTable(
  "drafts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    triggerMessageId: integer("trigger_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),

    status: text("status", {
      enum: ["generating", "ready", "sending", "sent", "failed", "ignored", "superseded"]
    }).notNull(),
    generatedText: text("generated_text"),
    // The text actually approved to send: equals generatedText unless the user edited it
    // before sending. Set on every approval attempt (including failed sends) so an
    // in-progress edit survives a reverted send; generatedText itself is never mutated
    // after generation, preserving pure AI output for later style comparison.
    finalText: text("final_text"),
    sentMessageId: integer("sent_message_id").references(
      (): AnySQLiteColumn => messages.id,
      { onDelete: "set null" }
    ),

    model: text("model"),
    promptVersion: text("prompt_version").notNull(),

    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    latencyMs: integer("latency_ms"),
    contextMessageCount: integer("context_message_count"),

    // Doubles as the last-action error: on a `failed` draft this describes the AI
    // generation failure; on a `ready` draft it describes the most recent failed send
    // attempt (cleared on the next successful transition). A `ready` draft is never
    // reachable with a stale value already set, since only failDraft() and the send-revert
    // path write these columns.
    errorKind: text("error_kind"),
    errorMessage: text("error_message"),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (table) => [
    // Partial: at most one non-superseded draft per trigger message. Regenerating marks
    // the old row 'superseded' before inserting the replacement, so this index enforces
    // "only one live/terminal draft per trigger" without blocking that insert.
    uniqueIndex("drafts_trigger_active_uq")
      .on(table.triggerMessageId)
      .where(sql`${table.status} != 'superseded'`),
    index("drafts_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    )
  ]
);

export const memoryFacts = sqliteTable(
  "memory_facts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    fact: text("fact").notNull(),
    // Only 'confirmed' reaches a prompt. 'rejected' rows are kept, not deleted, so the
    // extractor can be told not to propose them again.
    status: text("status", { enum: MEMORY_FACT_STATUSES })
      .notNull()
      .default("proposed"),
    sourceMessageId: integer("source_message_id").references(
      (): AnySQLiteColumn => messages.id,
      { onDelete: "set null" }
    ),
    promptVersion: text("prompt_version").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (table) => [
    // Exact-string dedup only; paraphrases still slip through.
    uniqueIndex("memory_facts_contact_fact_uq").on(table.contactId, table.fact),
    index("memory_facts_contact_status_idx").on(table.contactId, table.status)
  ]
);
