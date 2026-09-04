# AGENTS.md — Personal AI Communication Agent

## Purpose

This repository is a learning-first, production-minded personal AI project.

The product begins as a **WhatsApp reply copilot for an existing personal WhatsApp account** and may later evolve into a broader personal agent with memory, Gmail, Calendar, reminders, voice, and controlled tool use.

The core principle is:

> WhatsApp is only a channel adapter. Intelligence belongs in a reusable Agent Core.

This is both a real product and a learning project. Explain important architecture and trade-offs while building, but prefer incremental delivery and avoid overengineering.

---

## Developer Context

The developer is primarily a TypeScript/JavaScript developer working with:

- TypeScript
- JavaScript
- React
- Next.js
- Node.js

Local development environment:

- Windows
- PowerShell
- pnpm workspace

Prefer Windows-compatible commands. Do not assume Unix tools such as `find`, `grep`, `rm`, or Bash-only syntax are available.

When a PowerShell equivalent is needed, use PowerShell.

---

# Current Project Status

## Current phase

**Phase 1 — WhatsApp Transport is complete and manually verified.**

Do not redo Phase 0 or Phase 1 unless fixing a regression.

The next phase is:

**Phase 2 — Persistence**

Do not jump to Phase 3+ unless explicitly asked.

---

## Phase 0 — Foundation

Status: **COMPLETE / VERIFIED**

Acceptance criteria were manually tested successfully.

Phase 0 established the foundation for:

- pnpm workspace
- server app
- dashboard app
- TypeScript configuration
- environment validation
- Pino logging
- SQLite / Drizzle foundation
- migrations
- shared types/packages
- health endpoint
- project documentation
- local development scripts

Phase 0 is considered passing unless a later regression proves otherwise.

---

## Phase 1 — WhatsApp Transport

Status: **COMPLETE / VERIFIED**

Implemented and manually verified:

- WhatsApp transport using Baileys
- QR login
- linked-device authentication
- local auth persistence
- session survives server restart
- connection-state handling
- reconnect after temporary network loss
- incoming one-to-one text reception
- explicit server-controlled text sending
- outgoing global kill switch
- group messages ignored
- no automatic reply behavior
- graceful shutdown
- WhatsApp credentials excluded from Git

Known Phase 1 files include:

```text
apps/server/src/
├─ logger.ts
├─ whatsapp/
│  ├─ whatsapp.service.ts
│  └─ whatsapp.types.ts
├─ config/
│  └─ env.ts
└─ index.ts
```

The exact repository should always be inspected before editing. Preserve the current structure rather than recreating files blindly.

### Important Baileys rule

Do not silently upgrade or replace the installed Baileys version.

Before changing Baileys:

1. inspect `apps/server/package.json`
2. inspect the installed version
3. check compatibility and migration implications
4. explain the trade-off
5. only upgrade when justified or explicitly requested

Baileys is an unofficial WhatsApp integration, so transport changes must be conservative.

---

# Product Vision

Evolution:

```text
WhatsApp Copilot
    ↓
Messaging Assistant
    ↓
Context-Aware Agent
    ↓
Multi-Tool Personal AI
```

Long-term channels may include:

```text
WhatsApp ─┐
Gmail ────┼──→ Agent Core
Calendar ─┤
Voice ────┘
```

Do not tightly couple business logic to WhatsApp or Baileys.

---

# MVP

The MVP flow is:

```text
Incoming WhatsApp message
    ↓
normalize/store
    ↓
load context
    ↓
generate AI reply
    ↓
dashboard
    ↓
SEND / EDIT / REGENERATE / IGNORE
    ↓
approved reply is revalidated
    ↓
send
```

MVP ends after **Phase 5 — Approval MVP**.

Do not expand scope beyond the current phase merely because later architecture is already known.

---

# Technology Stack

Preferred stack:

- Node.js
- TypeScript
- pnpm
- Baileys or equivalent multi-device WhatsApp integration
- Fastify
- Next.js
- React
- Tailwind CSS
- shadcn/ui
- SQLite
- Drizzle ORM
- Zod
- OpenAI Responses API
- Server-Sent Events
- Pino
- FFmpeg
- Docker later

Initial deployment target:

- local Windows PC

Do not introduce infrastructure such as Kubernetes, Kafka, Redis, microservices, a large vector database, or multi-agent orchestration unless a concrete requirement justifies it.

---

# Architecture

Use a **modular monolith**.

Target architecture:

```text
WhatsApp
   ↓
Gateway / Transport
   ↓
Normalizer
   ↓
Router
   ↓
Database
   ↓
Policy + Context
   ↓
Agent
   ↓
Risk
   ↓
Draft / Auto decision
   ↓
Dashboard / Send
```

Agent Core responsibilities:

- identity
- preferences
- context
- memory
- policies
- risk
- reasoning
- tools

Channel adapters should be thin.

Baileys-specific objects should not leak deep into Agent Core, persistence, or business logic.

---

# Repository Shape

Target repository structure:

```text
personal-ai/
├─ apps/
│  ├─ server/
│  │  └─ src/
│  │     ├─ whatsapp/
│  │     ├─ messaging/
│  │     ├─ agent/
│  │     ├─ ai/
│  │     ├─ memory/
│  │     ├─ policies/
│  │     ├─ db/
│  │     ├─ api/
│  │     └─ realtime/
│  └─ dashboard/
├─ packages/
│  ├─ shared/
│  └─ types/
├─ data/
└─ docs/
```

This is a direction, not permission to pre-create every future module.

Create folders only when the current phase needs them.

---

# Core Domain Entities

These are the intended domain concepts.

## Contact

```text
id
whatsappJid
displayName
relationship
replyMode
notes
styleProfile
```

Reply modes:

```text
OFF
DRAFT
AUTO_SAFE
AUTO
```

Defaults:

- known contacts: DRAFT unless configured otherwise
- unknown contacts: OFF
- groups: OFF initially

---

## Conversation

```text
id
externalConversationId
contactId
type
summary
lastMessageAt
```

---

## Message

```text
id
conversationId
externalMessageId
senderId
direction
type
text
quotedMessageId
timestamp
origin
metadata
```

Message origins:

```text
CONTACT
USER_PHONE
AI_APPROVED
AI_EDITED
AI_AUTO
SYSTEM
```

---

## Draft

```text
id
conversationId
triggerMessageId
generatedText
confidence
riskLevel
model
promptVersion
status
createdAt
sentAt
```

These domain shapes may evolve during implementation. Prefer migrations and small deliberate changes over speculative abstraction.

---

# Critical Send Rules

These rules are non-negotiable.

Never send a stale or duplicate reply.

Immediately before any AI-generated or dashboard-approved send, revalidate the conversation.

Cancel or invalidate the send if any of these are true:

- the user manually replied from their phone
- another outgoing reply already exists
- a newer incoming message arrived
- conversation state materially changed
- the draft expired
- the trigger message is no longer the latest relevant message
- send state is uncertain
- validation fails
- transport state is uncertain

Core safety principle:

> On uncertainty or failure: DO NOTHING.

Do not implement optimistic autonomous sending.

---

# WhatsApp Safety Rules

Baileys is unofficial.

Therefore:

- no spam
- no bulk messaging
- no marketing automation
- unknown contacts OFF
- groups OFF initially
- Draft mode is the default
- auto-reply only for explicitly whitelisted contacts in later phases
- global kill switch must remain available
- never casually enable autonomous sending
- do not automatically reply directly inside a Baileys `messages.upsert` listener

The Phase 1 receive flow intentionally ends after receiving/logging the message.

Future receive flow should hand the event to application layers instead of sending immediately.

---

# Global Kill Switch

A global WhatsApp send kill switch exists.

During development, the safe default is:

```dotenv
WHATSAPP_KILL_SWITCH=true
```

When explicitly testing outgoing transport, it may be changed temporarily to:

```dotenv
WHATSAPP_KILL_SWITCH=false
```

After testing, restore it to `true` unless the current feature explicitly requires otherwise.

The kill switch protects server-controlled sends. It does not and should not block messages manually sent by the user from the WhatsApp phone app.

---

# WhatsApp Auth Security

WhatsApp linked-device auth state is sensitive.

The auth directory must never be committed.

Expected local area:

```text
data/whatsapp-auth/
```

Treat its files as credentials.

Never print or expose credential contents.

Never commit:

- WhatsApp auth files
- `.env`
- API keys
- database files containing private messages
- tokens
- secrets

Inspect `.gitignore` before modifying credential-related paths.

---

# Context Strategy

Do not send an entire WhatsApp history to an AI model.

Future context building should use:

```text
user style
+ contact profile
+ relationship
+ relevant memory
+ conversation summary
+ recent 10–30 messages
+ current message
```

The local database is the source of truth.

---

# Style Strategy

Replies should eventually sound like the user and vary by relationship.

Style dimensions include:

- length
- punctuation
- emoji usage
- Hinglish
- slang
- humor
- formality

Conceptually:

```text
Style =
global style
+ relationship style
+ contact style
+ current conversation tone
```

Store both:

- AI-generated draft
- user-edited final message

Use edits to improve prompting later.

Do not fine-tune initially.

---

# Memory Strategy

Memory is a later phase.

Use:

- recent working memory
- conversation summaries
- useful long-term facts

Intended pipeline:

```text
conversation
    ↓
extract useful fact
    ↓
dedupe / merge
    ↓
store
```

Do not add a vector database initially.

Use a vector database only after demonstrating that normal relational retrieval and summaries are insufficient.

---

# Risk Strategy

Risk is a later phase, but architecture should not make it difficult to add.

Examples:

## Low risk

- casual chat
- acknowledgements
- basic scheduling

## Medium risk

- professional messages
- travel
- important planning
- sensitive emotional topics

## High risk

- money
- payments
- banking
- OTPs / passwords
- medical
- legal
- relationship conflict
- resignations
- contracts

High-risk content must never auto-send.

Security-sensitive content may bypass AI generation entirely.

---

# Project Phases

## Phase 0 — Foundation

**COMPLETE**

- repo
- pnpm workspace
- server
- dashboard
- TypeScript
- env validation
- logging
- SQLite / Drizzle
- migrations
- shared types
- health route
- docs

---

## Phase 1 — WhatsApp Transport

**COMPLETE**

- Baileys
- QR login
- auth persistence
- reconnect
- connection state
- receive text
- explicit send text
- kill switch
- groups ignored

---

## Phase 2 — Persistence

**NEXT**

Objective:

```text
Baileys event
    ↓
Normalizer
    ↓
dedupe
    ↓
Contact
    ↓
Conversation
    ↓
Message
    ↓
SQLite
```

Work should include only what is necessary for:

- normalizing WhatsApp messages
- incoming/outgoing detection
- creating/updating contacts
- creating/updating conversations
- message persistence
- external message ID dedupe
- quoted-message handling
- basic group representation if necessary for storage, while groups remain operationally OFF
- timestamps
- origins such as CONTACT and USER_PHONE

Do not add AI drafting in Phase 2.

---

## Phase 3 — Dashboard

- conversation list
- chat view
- system status
- SSE updates

---

## Phase 4 — AI Drafting

- OpenAI integration
- context builder
- reply generator
- prompt versioning
- token/cost tracking
- draft persistence

---

## Phase 5 — Approval MVP

- SEND
- EDIT
- REGENERATE
- IGNORE
- stale-draft validation
- approved sending

**MVP COMPLETE after Phase 5 passes acceptance tests.**

---

## Phase 6 — Reliability

- reconnect hardening
- retries
- manual-reply cancellation
- race protection
- graceful shutdown hardening
- structured errors

---

## Phase 7 — Contact Policies

- relationships
- reply modes
- notes
- deterministic policy rules

---

## Phase 8 — Style Engine

- global style
- relationship style
- contact style
- learn from edits

---

## Phase 9 — Memory V1

- conversation summaries
- useful facts
- retrieval

---

## Phase 10 — Risk Engine

- casual
- professional
- financial
- security
- medical
- legal
- relationship risk

High risk remains approval-only.

---

## Phase 11 — Voice

```text
audio
→ transcription
→ normal messaging pipeline
```

---

## Phase 12 — Images

```text
image
→ vision model
→ normal reply pipeline
```

---

## Phase 13 — REACT / IGNORE

Allow the agent to react or ignore instead of always producing a text reply.

---

## Phase 14 — Selective Auto-Reply

Only when all required conditions are true:

```text
whitelisted
+ allowed reply mode
+ low risk
+ high confidence
+ no newer message
+ no manual reply
+ kill switch allows sending
```

---

## Phase 15 — Analytics

Track:

- approvals
- edits
- rejections
- latency
- model cost
- contact performance

---

## Phase 16 — Deployment

- Dockerize
- always-on home device or private VPS
- private access
- sensitive backup protection

---

## Phase 17+ — Personal Agent

Potential additions:

- Gmail
- Calendar
- reminders
- commitment detection
- waiting-on tracking
- attention inbox
- mobile / desktop / voice interfaces
- personal memory
- permissioned tools
- audit logs

Only begin after the messaging MVP is trustworthy.

---

# Do Not Build Early

Do not introduce these without explicit justification:

- Kubernetes
- Kafka
- microservices
- giant vector databases
- multi-agent systems
- fine-tuning
- unrestricted automation
- full-history ingestion
- elaborate event buses
- premature plugin systems
- broad generic tool frameworks

Prefer a modular monolith and straightforward TypeScript.

---

# Coding Rules

## General

- Use TypeScript.
- Preserve existing conventions.
- Make minimal patches.
- Do not rewrite unrelated working code.
- Prefer explicit code over clever abstractions.
- Avoid premature abstraction.
- Prefer small modules with clear ownership.
- Explain non-obvious architectural choices.
- Keep transport, persistence, policy, AI, and UI concerns separated.
- Validate external input with Zod where appropriate.
- Handle uncertainty explicitly.
- Fail closed for sends and consequential actions.

## Imports / ESM

Follow the repository's current TypeScript/Node module conventions.

If the project uses Node ESM / NodeNext and existing code imports compiled paths with `.js`, preserve that convention.

Do not change module strategy casually.

## Logging

Use the existing shared Pino logger.

Known logger:

```text
apps/server/src/logger.ts
```

Do not create parallel ad-hoc loggers unless there is a strong reason.

Never log secrets, credentials, auth state, tokens, or full sensitive payloads unnecessarily.

## Environment Variables

Use the existing validated environment configuration.

Do not read `process.env` throughout arbitrary modules when an existing validated `env` object is available.

For boolean env values, ensure parsing distinguishes the strings:

```text
"true"
"false"
```

Do not rely on generic JavaScript truthiness.

---

# Testing Philosophy

Every phase must meet its acceptance criteria before moving on.

## Unit test targets

Eventually include:

- message normalization
- policy decisions
- risk
- context selection
- memory merge
- draft expiry

## Integration test targets

- database
- AI client
- APIs
- SSE
- WhatsApp adapter

## End-to-end target

```text
receive
→ generate
→ edit
→ approve
→ send
→ restart
→ reconnect
```

Critical scenarios:

- duplicate incoming message
- manual phone reply during generation
- stale draft
- unknown contact
- financial request
- disconnect
- OpenAI failure

Never consider sending reliability complete without race-condition tests.

---

# Current Phase 2 Acceptance Mindset

While implementing persistence, focus on correctness before abstraction.

Important cases:

1. same WhatsApp event arrives twice
   - store one logical message

2. incoming DM arrives
   - identify/create contact
   - identify/create conversation
   - persist message

3. user manually sends from phone
   - store as outgoing
   - origin should eventually map to `USER_PHONE`

4. quoted reply arrives
   - preserve the external quote/reference information

5. group event arrives
   - may be represented if needed for correct persistence
   - must not enable group AI handling or auto-replies

6. unknown contact
   - persistence is allowed
   - reply policy remains OFF

---

# Commands

Always inspect `package.json` scripts before assuming a command exists.

Known root development command used successfully:

```powershell
pnpm dev
```

It currently runs server and dashboard workspaces in parallel.

The server has been run via:

```text
tsx watch src/index.ts
```

Useful workspace targeting pattern:

```powershell
pnpm --filter @personal-ai/server <command>
```

or path filtering when needed:

```powershell
pnpm --filter "./apps/server" <command>
```

For TypeScript verification, prefer an existing `typecheck` script if one exists.

If none exists and the current setup supports it:

```powershell
pnpm --filter @personal-ai/server exec tsc --noEmit
```

Do not invent scripts without first checking package manifests.

---

# pnpm Build-Script Policy

This project uses a pnpm version that may block dependency lifecycle scripts.

If pnpm reports ignored builds:

- inspect the dependency
- approve only dependencies that are actually required
- do not use broad `--all` approval casually
- preserve supply-chain caution

Do not weaken package-manager security settings merely to silence an install error.

---

# How to Work With the Developer

The developer is learning while building.

Therefore:

- teach important concepts as they appear
- explain why a design exists, not only what to type
- keep explanations practical
- distinguish temporary test code from production code
- call out what must be removed after a manual test
- avoid assuming advanced infrastructure knowledge
- do not patronize
- do not overwhelm a small fix with a large rewrite

When debugging:

1. identify the current phase
2. isolate the failing layer
3. patch minimally
4. explain the cause
5. give one verification step
6. continue only after the failure is understood

---

# Required Response Format for "continue the project"

When the developer says **"continue the project"**, respond using:

1. Current Phase
2. Objective
3. Why
4. Files to change
5. Data flow
6. Implementation
7. Tests
8. Done when
9. Next

Always identify the current phase first.

Do not jump ahead unless explicitly asked.

---

# Codex Working Rules

Before editing:

1. read this `AGENTS.md`
2. inspect relevant existing files
3. inspect package scripts and dependencies
4. understand the current phase
5. avoid assuming the repo matches a generic scaffold

When changing code:

- make the smallest coherent patch
- preserve conventions
- do not modify unrelated files
- do not silently add new dependencies
- explain dependencies before adding them when they materially affect architecture
- never expose secrets
- never weaken the global kill switch
- never enable auto-send as part of an unrelated change
- keep groups OFF unless a future phase explicitly changes policy

After changing code:

- run the narrowest relevant verification
- run type checking where practical
- run affected tests
- report failures clearly
- distinguish pre-existing failures from new failures
- do not claim success without verification

If a check fails, investigate before adding layers of workaround code.

---

# Documentation Rules

Maintain documentation when architecture or behavior changes.

Document:

- important architectural decisions
- new environment variables
- new security constraints
- phase acceptance changes
- schema/migration decisions
- unusual Baileys behavior
- send-safety invariants

Avoid large documentation rewrites for trivial implementation changes.

---

# Security Rules

Never commit or expose:

```text
.env
API keys
WhatsApp auth/session files
database files with personal data
tokens
credentials
passwords
OTP values
private cryptographic material
```

Later:

- encrypt sensitive backups
- minimize external data exposure
- add tool permissions
- add audit logging

The agent must not autonomously weaken security controls.

---

# Success Metrics

The product should optimize for:

- useful drafts
- low edit rate
- low rejection rate
- zero duplicate autonomous sends
- zero unsafe autonomous sends
- predictable Draft mode
- understandable behavior
- user control over consequential actions

Trustworthiness is more important than maximum automation.

---

# Core Invariants

Keep these true throughout the project:

```text
Draft mode stays default.

Unknown contacts stay OFF.

Groups stay OFF until explicitly enabled.

High-risk messages never auto-send.

WhatsApp auth stays private.

Local DB is the source of truth.

Do not send full chat history to models.

Never send stale drafts.

Never send duplicate replies.

Manual user replies override AI plans.

Consequential actions require stronger validation.

On uncertainty or failure: DO NOTHING.

Do not jump project phases.
```

---

# Immediate Next Work

The next task should be **Phase 2 — Persistence**.

Before coding, inspect:

- existing Drizzle schema
- migrations
- database initialization
- shared types
- current `messages.upsert` handling
- current WhatsApp message object handling
- server package scripts

Then design the smallest persistence path for:

```text
Baileys message
→ normalized application message
→ dedupe
→ contact
→ conversation
→ message row
```

Do not add AI drafting, dashboard chat features, style learning, memory, or auto-reply during Phase 2.
