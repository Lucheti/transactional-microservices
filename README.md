# beta

An NX monorepo of NestJS microservices driven by NATS. It's a **foundation**, not a product: a generic, extensible base that provides OOP/clean-architecture scaffolding, an API gateway, saga orchestration, and a memory-first (cache-aside) data layer. It ships with **no domain code** — you build your services on top using the playbooks in `docs/`.

## What the foundation provides

- **API gateway as the single entry point.** The gateway is the only HTTP surface and the only JWT verifier. Internal services have no HTTP listener — they're reachable only over NATS, behind the gateway.
- **Clean architecture per service** (hexagonal / ports & adapters): `domain → application → infrastructure → presentation`, dependencies pointing inward, ports bound to adapters via Symbol DI tokens. Enforced by ESLint module boundaries.
- **Saga orchestration with compensation.** The `orchestrator` service hosts sagas: a `SagaOrchestrator` coordinates a multi-service transaction and rolls it back (in reverse) when a step fails. Saga state is persisted (resumable).
- **Memory-first data layer (cache-aside).** A read checks Redis first; on a miss it hits Postgres and populates the cache. A write invalidates the cache so the next read returns fresh data. Implemented once in `CachedRepository`.
- **Shared contracts library** for the cross-service types: NATS subjects, DTOs, integration events, and the identity envelope.

## Architecture

```
                 HTTP (JWT verified here)
   client ───────────────────────────────►  api-gateway   (the only HTTP surface)
                                                  │
                                                  │  NATS  (commands: send · events: emit)
                                                  │  every message carries a typed identity envelope
                 ┌────────────────────────────────┼───────────────────────────────┐
                 ▼                                 ▼                                ▼
            a service                         orchestrator                   another service
        (pure NATS, you add)                (hosts sagas)                 (pure NATS, you add)
                 │                                 │                                │
        Redis ◄──┴── Postgres                  Postgres                   Redis ◄──┴── Postgres
        (cache)     (beta_<svc>)              (beta_saga)                 (cache)     (beta_<svc>)
```

Internal services are pure NATS microservices (`NestFactory.createMicroservice`). The gateway forwards HTTP to them via `ClientProxy.send`, wrapped in a `NatsGatewayAdapter` that applies a timeout and maps failures back to HTTP status codes.

## Layout

```
apps/
  api-gateway/    The only HTTP app. JWT auth guard + a dev token endpoint. Forwards to services over
                  NATS via NatsGatewayAdapter. Add your domain controllers here.
  orchestrator/   Pure NATS microservice that hosts sagas. Ships empty (saga DB + wiring ready); drop in
                  saga modules as you need them.
libs/
  core/           @beta/core        Framework-agnostic DDD primitives: Entity, AggregateRoot,
                                    ValueObject, Result, Guard. No framework imports.
  contracts/      @beta/contracts   IdentityContext + RequestEnvelope, shared JWT config, and the generic
                                    IntegrationEvent base. (Per-domain subjects/DTOs go here as you add them.)
  nats/           @beta/nats        NatsClientModule, NATS_CLIENT token, NatsGatewayAdapter,
                                    HttpException↔RpcException filters.
  cache/          @beta/cache       ioredis module + CachePort + RedisCacheAdapter.
  persistence/    @beta/persistence BaseEntity, buildTypeOrmOptions, and the generic
                                    abstract CachedRepository (the cache-aside base class).
  saga/           @beta/saga        SagaStep, SagaOrchestrator, durable SagaState,
                                    SagaStateStore (+ TypeORM impl).
```

Library dependency rules are enforced in `eslint.config.mjs`:
`core → (nothing)`, `contracts → core`, `nats → contracts/core`, `cache/persistence (infra) → core/infra`, `saga → infra/core`, `apps → anything`.

### Clean architecture inside a service

A service is a hexagonal slice. No example ships — `docs/playbooks/add-a-cached-entity.md` has the full template:

```
<feature>/
  domain/          <Entity> aggregate (+ invariants), <Entity>RepositoryPort (interface + Symbol), <Entity>Snapshot
  application/     use cases; depend on ports via @Inject(TOKEN), never on TypeORM/Redis
  infrastructure/  TypeORM entity, <Entity>CacheStore (extends CachedRepository),
                   <Entity>Repository (maps domain↔snapshot)
  presentation/    @MessagePattern controller, module wiring (ports → adapters)
```

Caching lives behind the repository port: the `CacheStore` **is-a** `CachedRepository` (inheritance); the `Repository` **uses** it (composition) to map snapshots ↔ the rich domain entity.

## The two core data flows

- **Cache-aside (memory-first):** repository read → Redis → on miss load Postgres + populate; write → persist then delete the cache key, so the next read repopulates. Implemented once in `@beta/persistence`'s `CachedRepository`. → `docs/playbooks/add-a-cached-entity.md`
- **Saga (orchestration + compensation):** the orchestrator runs ordered `SagaStep`s (each `execute` + optional `compensate`). On a step failure, completed steps are compensated in reverse and the durable `SagaState` ends `COMPENSATED`. → `docs/playbooks/add-a-saga.md`

## Tech stack

NX 22 · NestJS 11 · `@nestjs/microservices` (NATS, `nats` v2) · TypeORM 0.3 + Postgres 16 · ioredis + Redis 7 · class-validator · Jest. Node 24, npm.

## Getting started

### Everything in Docker

```sh
docker compose up --build
# gateway on http://localhost:3000/api ; nats:4222 ; redis:6379 ; postgres:5432
```

### Local dev (infra in Docker, apps with NX)

```sh
docker compose up -d nats redis postgres
cp .env.example .env
npx nx run-many -t serve -p orchestrator api-gateway
```

## Verify

```sh
npx nx run-many -t build test lint    # all green; runs the foundation unit tests
docker compose up --build             # gateway + orchestrator boot, infra healthy

# the gateway ships exactly one endpoint today — mint a dev JWT:
curl -s -X POST localhost:3000/api/dev/token -H 'content-type: application/json' \
  --data '{"email":"dev@beta.local","roles":["user"]}'
```

No domain endpoints ship yet — add one with a playbook below, then verify it via that playbook's own steps.

## Extending it

The codebase is documented for both humans and AI coding agents. Start with **`CLAUDE.md`** (the rules + invariants + a "pick the right mechanism" decision guide, auto-loaded by Claude Code), then:

- `docs/architecture.md` — the mental model and anti-patterns
- `docs/conventions.md` — naming, DI, layering, testing, build gotchas
- `docs/playbooks/` — step-by-step recipes:
  - [`add-a-service.md`](docs/playbooks/add-a-service.md) — a new internal microservice
  - [`add-a-cached-entity.md`](docs/playbooks/add-a-cached-entity.md) — an entity with cache-aside persistence
  - [`add-a-gateway-endpoint.md`](docs/playbooks/add-a-gateway-endpoint.md) — expose something over HTTP
  - [`add-a-saga.md`](docs/playbooks/add-a-saga.md) — a multi-service transaction with compensation
  - [`add-an-event.md`](docs/playbooks/add-an-event.md) — publish/consume integration events
  - [`add-authorization.md`](docs/playbooks/add-authorization.md) — role-based access at the gateway

Each playbook is a self-contained template (exact command, file-by-file code, wiring, verification) — there are no example slices to copy from.

## Notes

- `DB_SYNCHRONIZE=true` and the `/api/dev/token` endpoint are **dev-only**. Use real migrations and remove the dev token (or keep `DEV_TOKEN_ENDPOINT_ENABLED` unset) before any real deployment.
- Internal services trust the identity propagated by the gateway; they are not meant to be reachable directly.
```
