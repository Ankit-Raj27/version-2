# Phase 0 — Foundation

## Objective

Create a reproducible local development foundation for the modular monolith.

## Included

- pnpm workspace
- TypeScript baseline
- Fastify server
- Next.js + Tailwind dashboard
- Zod environment validation
- Pino/Fastify structured logging
- SQLite + Drizzle
- migrations
- health route
- health test
- architecture/security documentation

## Explicitly excluded

- Baileys / WhatsApp session
- contacts, conversations, messages, drafts schema
- OpenAI API calls
- SSE
- reply policies
- memory
- risk classification
- auto-send

## Acceptance

Phase 0 is complete only after install, dev, health, migration, tests, typecheck, and build all pass locally.
