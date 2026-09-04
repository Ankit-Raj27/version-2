# CLAUDE.md — Working State & Context

> The full product spec, phase definitions, and coding rules live in [AGENTS.md](AGENTS.md).
> **This file tracks what is actually built right now** and is updated as work progresses.
> If this file and AGENTS.md disagree about status, trust the repo and fix this file.

---

## Project

Personal AI communication agent. Starts as a **WhatsApp reply copilot** for one existing
personal WhatsApp account; may later grow into a broader personal agent (memory, Gmail,
Calendar, reminders, voice, tools).

Core principle: **WhatsApp is only a channel adapter. Intelligence belongs in a reusable
Agent Core.** Baileys objects must not leak into persistence, business logic, or the dashboard.

Learning-first but production-minded. **Modular monolith.** No Kubernetes / Kafka / Redis /
microservices / vector DB until a concrete need proves it necessary.

---

## Environment

- Windows + PowerShell, pnpm workspace (`pnpm@11`, Node `>=24 <25`).
- A Bash tool is also available; still prefer Windows-friendly commands.
- Root commands:
  - `pnpm dev` — server + dashboard in parallel
  - `pnpm typecheck` / `pnpm test` / `pnpm build`
  - `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio`
  - `pnpm verify` — typecheck + test + build + db:migrate
- Workspace filter pattern: `pnpm --filter @personal-ai/server <cmd>`

---

## Workspace layout (actual)

```
apps/
  server/     @personal-ai/server     Fastify 5 + Drizzle + better-sqlite3 + Baileys 7.0.0-rc14
  dashboard/  @personal-ai/dashboard  Next.js 16 (App Router) + React 19 + Tailwind v4
packages/
  shared/     @personal-ai/shared     only exports APP_NAME — NOT consumed anywhere yet
  types/      @personal-ai/types      only exports HealthStatus — NOT consumed anywhere yet
data/         SQLite db + whatsapp-auth/ (both gitignored)
docs/         architecture.md, decisions/0001-modular-monolith.md, phase-0.md
```

`packages/*` are **not** listed as dependencies of either app and are currently unused.
Consuming one requires adding a workspace dep (e.g. `"@personal-ai/types": "workspace:*"`)
and building it first (`tsc` → `dist/`).

---

## Current phase

**Phase 2 — Persistence: IMPLEMENTED / AUTOMATED CHECKS PASS; MANUAL WHATSAPP VERIFICATION PENDING.**

| Phase | Status |
|-------|--------|
| Phase 0 — Foundation | COMPLETE / VERIFIED |
| Phase 1 — WhatsApp Transport | COMPLETE / VERIFIED |
| Phase 2 — Persistence | **Implemented** — automated checks pass; live WhatsApp walkthrough pending |
| Phase 3 — Dashboard | Blocked until Phase 2 manual acceptance is complete |

Git history: `initalizing project version-2` → `update/ connected whatsapp with a kill switch`. Two commits.

---

## What is implemented

### Phase 0 — Foundation (done)

| Concern | File |
|---|---|
| Fastify app builder | `apps/server/src/app.ts` |
| Server entry + graceful shutdown | `apps/server/src/index.ts` |
| Env validation (Zod) | `apps/server/src/config/env.ts` |
| Repo-root path helper | `apps/server/src/config/paths.ts` |
| Pino logger | `apps/server/src/logger.ts` |
| DB client (drizzle + better-sqlite3, WAL, `foreign_keys=ON`) | `apps/server/src/db/client.ts` |
| Schema — `app_metadata`, `contacts`, `conversations`, `messages` | `apps/server/src/db/schema.ts` |
| Migrations 0000 + 0001 | `apps/server/drizzle/` |
| Health route (`GET /health`, 200 / 503) | `apps/server/src/api/routes/health.ts` |
| Health test (vitest, `app.inject`) | `apps/server/test/health.test.ts` |
| Dashboard shell + health status cards | `apps/dashboard/app/page.tsx`, `layout.tsx` |

### Phase 1 — WhatsApp Transport (done)

All under `apps/server/src/whatsapp/`:

- **`whatsapp.service.ts`** — `WhatsAppService` singleton exported as `whatsappService`
  - Baileys `makeWASocket`, multi-file auth state at `data/whatsapp-auth/`
  - Connection state machine: `idle → connecting → qr → connected → disconnected / logged_out`
  - Reconnect (3 s timer), `loggedOut` detection, graceful `stop()`
  - `sendText(jid, text)` — guarded in order: kill switch → connected → non-empty text
  - `messages.upsert` listener now hands live events to the Phase 2 normalizer and
    persistence service; it still never sends or replies
- **`whatsapp.types.ts`** — `WhatsAppConnectionState`, `WhatsAppStatus`
- Wired in `index.ts`: `whatsappService.start()` runs after `app.listen(...)`

### Phase 2 — Persistence (implemented; manual acceptance pending)

| Concern | File |
|---|---|
| Contact/conversation/message schema | `apps/server/src/db/schema.ts` |
| Runtime migration helper | `apps/server/src/db/migrate.ts` |
| Baileys-free message contract | `apps/server/src/messaging/message.types.ts` |
| Transactional persistence + DB dedupe | `apps/server/src/messaging/persistence.ts` |
| Baileys message normalizer | `apps/server/src/whatsapp/normalize.ts` |
| Live listener integration | `apps/server/src/whatsapp/whatsapp.service.ts` |
| Migration | `apps/server/drizzle/0001_optimal_tigra.sql` |
| Test bootstrap | `apps/server/vitest.config.ts`, `apps/server/test/setup.ts` |
| Unit/integration tests | `apps/server/test/normalize.test.ts`, `apps/server/test/persistence.test.ts` |

The normalizer handles incoming/outgoing direct messages, groups, quotes, LID/phone
alternate identifiers, wrapper messages, and unsupported content. Persistence creates or
reuses contacts and conversations, inserts messages transactionally, resolves quotes when
possible, keeps `last_message_at` monotonic, and deduplicates using a SQLite unique index.

### Env vars in use

`NODE_ENV`, `SERVER_HOST` (`127.0.0.1`), `SERVER_PORT` (`3001`),
`DATABASE_URL` (`./data/personal-ai.db`), `LOG_LEVEL`,
`WHATSAPP_ENABLED`, `WHATSAPP_AUTH_DIR`, `WHATSAPP_KILL_SWITCH`.
Booleans parsed with `z.stringbool()`. Dashboard reads `SERVER_BASE_URL`
(default `http://127.0.0.1:3001`) to reach the server.

---

## Conventions to preserve

- **ESM everywhere.** Server = `NodeNext`; relative imports carry a `.js` extension.
  Dashboard = `bundler` resolution, `.tsx`.
- Routes register via `export async function registerXRoute(app: FastifyInstance)` and
  `app.register(...)` in `app.ts`.
- One shared Pino logger (`apps/server/src/logger.ts`) — no ad-hoc loggers.
  Pino serializes an error object only under the key `err`.
- All env access goes through the validated `env` object, never bare `process.env`.
- DB is accessed only via `db` from `apps/server/src/db/client.ts`.
  The dashboard never touches SQLite — it calls the Fastify server over HTTP.
- Baileys types are confined to `whatsapp/*.ts`; `messaging/` uses only
  `NormalizedMessage` and application types.
- Message dedupe is enforced by `UNIQUE(conversation_id, external_message_id)` plus
  `ON CONFLICT DO NOTHING`; never replace it with an in-memory set.
- Drizzle migration flow: edit `schema.ts` → `pnpm db:generate` → commit the SQL → `pnpm db:migrate`.
- Tests: vitest, `app.inject()` for HTTP, no heavy fixtures.
- Minimal patches. No speculative abstraction. Explain non-obvious architecture while building.

---

## Safety invariants (never break)

- Global kill switch (`WHATSAPP_KILL_SWITCH`) always available; safe default `true`.
- Unknown contacts OFF, groups OFF, Draft mode default.
- Local SQLite is the source of truth.
- Never auto-reply inside a Baileys listener.
- Never send stale or duplicate replies; manual phone replies override AI plans.
- On uncertainty or failure: **DO NOTHING.**
- Do not skip project phases.

---

## Session changelog

Newest first. One line per change.

### 2026-09-04

- Implemented Phase 2 persistence: schema/migration, runtime migrations, normalized
  message boundary, transactional contact/conversation/message storage, quote resolution,
  group persistence, unsupported-message storage, and database-backed dedupe.
- Rewired `messages.upsert` to normalize and persist live `notify` events while preserving
  the no-send/no-reply boundary and skipping status, broadcast, and newsletter events.
- Added isolated in-memory migration setup plus normalizer and persistence tests.
- Removed the transport kill-switch debug log, kept the Phase 1 send test removed, and
  restored `WHATSAPP_KILL_SWITCH=true` in `.env` and `.env.example`.
- Fixed boolean env parsing: `z.coerce.boolean()` → `z.stringbool()` in
  `apps/server/src/config/env.ts`. `Boolean("false")` is truthy, so the kill switch could
  not be turned off from `.env`. Affects `WHATSAPP_ENABLED` + `WHATSAPP_KILL_SWITCH`.
- Fixed error logging in `apps/server/src/index.ts`: `logger.error({ error })` →
  `{ err: error }` so Pino serializes the message + stack.
- Created this file.
