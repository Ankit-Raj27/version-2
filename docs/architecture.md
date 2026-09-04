# Architecture

## Current scope

The project is a modular monolith with two apps and shared packages. Phase 2 adds the
first application-level messaging boundary and durable message storage:

```text
personal-ai/
  apps/
    server/
    dashboard/
  packages/
    shared/
    types/
  data/
  docs/
```

The server owns process-level concerns such as configuration, logging, API routes, and database access. Later phases will add `whatsapp`, `messaging`, `agent`, `ai`, `memory`, `policies`, and `realtime` modules inside the same server application.

## Long-term data flow

```text
WhatsApp -> Gateway -> Normalizer -> Router -> DB
  -> Policy + Context -> Agent -> Risk -> Draft/Auto
  -> Dashboard/Send
```

The implemented Phase 2 path is:

```text
Baileys message
  -> whatsapp/normalize.ts
  -> Baileys-free NormalizedMessage
  -> messaging/persistence.ts
  -> contacts + conversations + messages in SQLite
```

The WhatsApp adapter owns transport details. The normalizer is the translation boundary.
The `messaging/` module owns the application message contract and transactional storage,
and does not import Baileys types. Later phases build on this path without moving database
logic into the transport listener.

## Source of truth

The local SQLite database is the source of truth for application state. Channel adapters are inputs/outputs, not memory stores.

Message replay safety is enforced in SQLite by a unique constraint on
`(conversation_id, external_message_id)`, not by process memory.

## Safety invariant

Draft mode remains the default. Autonomous sending must not be enabled as a side effect of infrastructure work.
