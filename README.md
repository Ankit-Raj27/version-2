# Personal AI

Controlled personal AI communication agent. The project starts as a WhatsApp reply copilot, but intelligence will live in a reusable Agent Core rather than in the WhatsApp adapter.

## Current phase

**Phase 0 — Foundation**

No WhatsApp transport, AI drafting, memory, or autonomous sending is enabled in this phase.

## Requirements

- Node.js 24 LTS
- Corepack
- pnpm 11.25.0 (pinned through `packageManager`)

## Setup

```powershell
corepack enable
corepack prepare pnpm@11.25.0 --activate
Copy-Item .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Dashboard: `http://127.0.0.1:3000`

Server health: `http://127.0.0.1:3001/health`

## Verification

In a separate terminal:

```powershell
pnpm verify
```

Phase 0 passes only when:

- `pnpm install` succeeds.
- `pnpm dev` starts both server and dashboard.
- `GET /health` returns HTTP 200 with `status: "ok"` and `database: "ok"`.
- `pnpm db:generate` can generate a migration from the Drizzle schema.
- `pnpm db:migrate` applies migrations successfully.
- `pnpm typecheck`, `pnpm test`, and `pnpm build` all succeed.

## Security baseline

Never commit `.env`, local databases, WhatsApp auth state, API keys, tokens, or future channel credentials. `data/` is ignored except for its placeholder file.

See `docs/architecture.md` and `docs/decisions/0001-modular-monolith.md`.
