# Phase 2 — Persistence

## Objective

Turn live WhatsApp events into normalized, deduplicated, durable SQLite records without
adding drafting, dashboard chat features, or automatic replies.

```text
Baileys event
  -> normalize
  -> dedupe
  -> contact
  -> conversation
  -> message
  -> SQLite
```

## What shipped

- `contacts`, `conversations`, and `messages` tables with foreign keys and indexes.
- Runtime migrations at server startup and isolated in-memory migrations for tests.
- A Baileys-free normalized-message contract.
- Pure normalization for direct/group and incoming/outgoing messages, quotes, wrappers,
  alternate LID/phone identifiers, and unsupported content.
- Transactional find-or-create persistence, best-effort local quote resolution,
  monotonic `last_message_at`, and restart-safe database deduplication.
- A thin `messages.upsert` listener that persists live `notify` events and never replies.
- Automated normalizer, persistence, database, and health coverage.

## Acceptance status

Automated implementation checks pass. Phase 2 remains awaiting manual acceptance until
the live WhatsApp walkthrough below is completed.

- [x] Incoming and outgoing normalization and persistence are covered by tests.
- [x] Contacts and conversations are created once and reused.
- [x] Duplicate events create one message row.
- [x] Quotes preserve external IDs and resolve local rows when available.
- [x] Groups persist with a null conversation contact and participant sender.
- [x] LID identity and alternate JIDs are preserved.
- [x] Unsupported content persists; control and malformed events are safely skipped.
- [x] `last_message_at` never moves backward.
- [x] The listener contains no database queries and never sends or replies.
- [x] Runtime migrations are idempotent and the kill switch defaults to `true`.
- [ ] Live direct, outgoing-phone, quote, group, reconnect, and restart behavior inspected.

## Manual verification

1. Run `pnpm.cmd --filter @personal-ai/server db:studio` and confirm the four tables:
   `app_metadata`, `contacts`, `conversations`, and `messages`.
2. Run `pnpm.cmd dev`, connect the existing WhatsApp linked device, and send an incoming
   direct text from another account. Confirm one contact, one direct conversation, and one
   incoming `CONTACT` message.
3. Send a message from the linked account's phone. Confirm an outgoing `USER_PHONE`
   message with `sender_id` null.
4. Reply with a quote. Confirm `quoted_external_message_id`; when the quoted row is local,
   confirm `quoted_message_id` points to it.
5. Send a message in a small test group. Confirm a group conversation with `contact_id`
   null and a message linked to the participant contact. Confirm no reply is sent.
6. Restart the server or reconnect WhatsApp. Confirm existing rows remain and replayed
   events do not add duplicates.
7. Run `pnpm.cmd verify` from the repository root.

## Deferred deliberately

- Phone-JID/LID identity merging and group title fetching.
- History import, reactions, media processing, transcription, and vision.
- Dashboard UI, SSE, AI drafting, policies, risk, memory, and all automatic sending.
