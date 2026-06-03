<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax


<!-- nx configuration end-->

# beta — guide for AI agents

beta is an NX monorepo of NestJS microservices over NATS. It is a **foundation**: a generic, reusable base (gateway, NATS transport, cache-aside persistence, saga orchestration, shared contracts) with no domain code yet. Build your services *on* the base — don't reinvent that machinery. The playbooks in `docs/playbooks/` are self-contained templates; there are no example slices to copy from.

This file is always in your context. It states the rules and points to the deeper docs. **Read the relevant doc before building** — they exist so you don't have to reverse-engineer the patterns from the example code.

## Where to look

| You're doing… | Read |
|---|---|
| Understanding how it fits together | `docs/architecture.md` |
| Naming / DI / layering / testing / gotchas | `docs/conventions.md` |
| Adding a whole new internal service | `docs/playbooks/add-a-service.md` |
| Adding an entity with cache-aside persistence | `docs/playbooks/add-a-cached-entity.md` |
| Exposing something over HTTP | `docs/playbooks/add-a-gateway-endpoint.md` |
| A multi-service transaction | `docs/playbooks/add-a-saga.md` |
| Publishing / consuming an event | `docs/playbooks/add-an-event.md` |
| Restricting access by role | `docs/playbooks/add-authorization.md` |

When you edit anything under `apps/`, `apps/CLAUDE.md` is auto-loaded with the service-layering rules.

## Pick the right mechanism (decide this first)

Identify the *shape* of the work before writing code — this is how you know what to build and which playbook to open:

- **Do something in one service and get a result back** → a **command**: a gateway endpoint that forwards over NATS to one `@MessagePattern`. → `add-a-gateway-endpoint.md`
- **Read or write one service's own data** → a **repository port** backed by `CachedRepository`. → `add-a-cached-entity.md`
- **Announce that something happened; others may react; no reply** → an **event** (`emit` / `@EventPattern`). → `add-an-event.md`
- **Change state across two or more services as one atomic unit** (partial failure must roll back) → a **saga**, built in the **`orchestrator`** service (`SagaOrchestrator` + `SagaStep`s with `compensate`). → `add-a-saga.md`
  - ⚠️ The tell: you're about to make a controller or use case call two services and write to both. **Stop — chained `nats.send` calls have no rollback.** That coordination is a saga's job; put it in the orchestrator and have the gateway trigger the one saga.
- **Restrict who can call an endpoint** → roles at the gateway. → `add-authorization.md`

## Non-negotiable invariants

1. **The gateway is the only HTTP surface and the only JWT verifier.** Internal services are pure NATS microservices (no HTTP listener; `@MessagePattern`, not `@Get`/`@Post`). They trust the `IdentityContext` propagated in the message envelope and never re-verify auth.
2. **Clean architecture per service:** `domain → application → infrastructure → presentation`, dependencies pointing inward. The domain layer imports no framework / ORM / NATS. Use cases depend on **ports** (interfaces), bound to adapters with **Symbol tokens**: `{ provide: TOKEN, useClass: Adapter }`.
3. **Data access goes through a repository port backed by `CachedRepository`.** Never inject a TypeORM repository into a use case or controller. Reads are Redis-first; writes invalidate the cache automatically.
4. **Atomic cross-service work uses a saga** (a `SagaOrchestrator` of `SagaStep`s with `execute`/`compensate`), never distributed 2PC or a shared DB.
5. **Everything that crosses the wire lives in `@beta/contracts`:** NATS subjects, DTOs, events, and the `RequestEnvelope`. Services share contracts — never each other's entities or internals.
6. **Respect the library dependency DAG** (ESLint enforces it): `core → ∅`; `contracts → core`; `nats → contracts, core`; `cache`/`persistence` (infra) `→ core, infra`; `saga → core, infra`; `apps → anything`. If `@nx/enforce-module-boundaries` complains, your dependency direction is wrong — fix the design, don't loosen the rule.

## Stack & commands

- **npm** (not pnpm), Node 24. NX 22 · NestJS 11 · `@nestjs/microservices` (NATS, `nats` v2) · TypeORM 0.3 + Postgres 16 · ioredis + Redis 7.
- Build / test / lint everything: `npx nx run-many -t build test lint`. One project: `npx nx <target> <project>`.
- Serve one app: `npx nx serve <app>`.
- Generators reject positional names — **always pass `--name=`** (see playbooks). Prefix with `CI=true` to avoid interactive prompts.
- Full stack: `docker compose up --build` (gateway on `http://localhost:3000/api`). Infra only: `docker compose up -d nats redis postgres`.

## Definition of done

A change is done when **`npx nx run-many -t build test lint` is green**, and — for runtime changes — the affected app boots: `npx nx serve <app>` reaches the NATS/DB connection stage with **no "Nest can't resolve dependencies" error** (connection errors without infra are expected). For features, verify through the gateway: mint a dev token (`POST /api/dev/token`) and curl the endpoint (see `README.md` → End-to-end verification).

## Foundation libraries — reuse, don't duplicate

| Lib | Provides |
|---|---|
| `@beta/core` | `Entity`, `AggregateRoot`, `ValueObject`, `Result`, `Guard` (framework-agnostic) |
| `@beta/contracts` | NATS patterns, DTOs, integration events, `IdentityContext`, `RequestEnvelope`, `envelope()`, `SharedJwtModule`, `JwtPayload` |
| `@beta/nats` | `NatsClientModule`, `NATS_CLIENT`, `NatsGatewayAdapter`, `HttpToRpcExceptionFilter`, `RpcToHttpFilter` |
| `@beta/cache` | `RedisModule`, `CachePort` + `CACHE_PORT`, `RedisCacheAdapter` |
| `@beta/persistence` | `BaseEntity`, `buildTypeOrmOptions`, abstract `CachedRepository` |
| `@beta/saga` | `SagaStep`, `SagaOrchestrator`, `SagaState`, `SagaStateStore` + `SAGA_STATE_STORE`, `SagaPersistenceModule` |

Changing a foundation lib affects every consumer. Prefer extending in app code; if you must change a lib, keep its public surface backward-compatible and run the full test suite.
