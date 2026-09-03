# ADR 0001: Use a modular monolith

## Status

Accepted for Phase 0.

## Context

The product needs clear boundaries between messaging transport, persistence, policies, Agent Core, AI providers, memory, realtime updates, and the dashboard. It does not yet need independent scaling or deployment of those pieces.

## Decision

Use a pnpm monorepo containing a Fastify server, a Next.js dashboard, and small shared packages. Keep backend capabilities as modules within one server process until operational evidence justifies splitting them.

## Consequences

Benefits:

- Fast local iteration on Windows.
- Simple transactions and race protection around message/draft state.
- Fewer network boundaries and fewer deployment concerns.
- Boundaries can still be enforced through module APIs.

Costs:

- Module discipline matters because process boundaries do not enforce ownership.
- A future split may require extraction work if independent scaling becomes necessary.

## Rejected for now

Microservices, Kafka, Kubernetes, multi-agent orchestration, and a vector database are intentionally deferred.
