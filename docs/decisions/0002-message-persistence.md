# ADR 0002: Normalize before transactional message persistence

## Status

Accepted for Phase 2.

## Context

Baileys can replay message events after reconnects, uses transport-specific message
shapes, and may identify a person using either a phone JID or an LID. Persistence must be
restart-safe without coupling the application database to Baileys internals.

## Decision

- Translate each live Baileys message into a Baileys-free `NormalizedMessage` in
  `whatsapp/normalize.ts` before calling the persistence service.
- Store contacts, conversations, and messages inside one synchronous SQLite transaction.
- Deduplicate messages with `UNIQUE(conversation_id, external_message_id)` and
  `ON CONFLICT DO NOTHING`. WhatsApp message IDs are scoped to a conversation, and a
  database constraint survives reconnects and process restarts.
- Store the JID Baileys provides after device-suffix normalization. Preserve an alternate
  phone/LID JID when supplied, but defer identity merging.
- Store a quote's external message ID as the durable reference and resolve the local
  self-referencing foreign key only when the quoted row already exists.
- Persist group conversations and their participant senders, but do not enable group AI,
  reply, or send behavior.
- Represent the local user with `messages.sender_id = NULL`; Phase 2 does not create a
  self-contact row.

## Consequences

- A Baileys upgrade mainly affects the adapter and normalizer rather than storage logic.
- Replayed events cannot create duplicate logical messages, including after restart.
- One person may temporarily have separate phone-JID and LID contact rows. A later phase
  can reconcile them using `alt_jid` if real usage demonstrates the need.
- Quote information is retained even when the quoted message predates local persistence.
- No row locks or asynchronous queue are needed: better-sqlite3 is synchronous and the
  transaction makes each multi-row write all-or-nothing.
