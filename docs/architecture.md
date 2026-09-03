# Architecture

## Current scope

Phase 0 establishes a modular monolith with two apps and shared packages:

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

This is an architectural target, not Phase 0 functionality.

## Source of truth

The local SQLite database is the source of truth for application state. Channel adapters are inputs/outputs, not memory stores.

## Safety invariant

Draft mode remains the default. Autonomous sending must not be enabled as a side effect of infrastructure work.
