import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn
} from "drizzle-orm/sqlite-core";

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
    relationship: text("relationship"),
    replyMode: text("reply_mode", {
      enum: ["OFF", "DRAFT", "AUTO_SAFE", "AUTO"]
    })
      .notNull()
      .default("OFF"),
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
