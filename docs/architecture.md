# Architecture

The mental model you need before changing anything. For the rules-at-a-glance see the root `CLAUDE.md`; for how-to recipes see `docs/playbooks/`.

## The shape

```
              HTTP (JWT verified here, once)
   client ───────────────────────────────►  api-gateway
                                                  │  NATS request/response (client.send) + events (client.emit)
                                                  │  every message = RequestEnvelope { identity, payload, meta }
              ┌───────────────────────────────────┼────────────────────────────────┐
              ▼                                    ▼                                 ▼
        a service                           another service                  orchestrator
      (your domain)                       (your domain)                    (hosts sagas)
              │                                    │                                 │
       Redis ─┴─ Postgres                  Redis ─┴─ Postgres                    Postgres
      (cache)   (beta_<svc>)              (cache)   (beta_<svc>)              (beta_saga)
```

- **api-gateway** is the only thing with an HTTP server and the only JWT verifier. It translates HTTP → NATS and propagates a typed identity.
- **Internal services** are pure NATS microservices created with `NestFactory.createMicroservice`. No HTTP, no public port. They're reachable only through the gateway, so they trust the identity handed to them.
- **orchestrator** is just another internal service whose job is coordinating sagas; it owns the saga database.

## The four pillars

### 1. Gateway + hidden services
The gateway holds the JWT guard (`HttpJwtGuard`), turns the verified token into an `IdentityContext`, and forwards calls with `NatsGatewayAdapter.send(pattern, envelope(identity, payload))`. `NatsGatewayAdapter` applies a timeout and normalizes failures into HTTP-mappable errors. Internal services never see HTTP and never re-check auth.

### 2. Clean architecture per service (hexagonal / ports & adapters)
`domain → application → infrastructure → presentation`. The domain is pure TypeScript; the application orchestrates use cases against **ports** (interfaces); infrastructure provides the **adapters** (TypeORM, Redis, NATS); presentation is the `@MessagePattern` controller. Ports are bound to adapters with Symbol DI tokens. This is what lets us swap the DB or cache without touching business logic — and what makes use cases unit-testable with fakes.

### 3. Memory-first data layer (cache-aside)
`@beta/persistence`'s abstract `CachedRepository<T>` implements the pattern once: read → check Redis → on miss load DB + populate; write → persist DB then **delete** the cache key(s). A service's `<Entity>CacheStore` extends it and supplies the DB hooks + key prefix; the `<Entity>Repository` maps the cached **snapshot** (a plain serializable object) to/from the rich domain entity. The cache stores snapshots, never live domain objects (they wouldn't survive JSON round-tripping).

### 4. Saga orchestration with compensation
For a unit of work spanning services (you can't use a DB transaction across databases), a `SagaOrchestrator` runs an ordered list of `SagaStep`s. Each step has `execute` and (optionally) `compensate`. On failure the orchestrator marks the saga `FAILED`, runs `compensate` for the already-completed steps **in reverse**, and ends `COMPENSATED`. State is persisted in `SagaState` (status, completed steps, failed step, context) so a crashed saga is resumable. This is *orchestration* (a central coordinator issuing commands), deliberately not *choreography* (services reacting to each other's events).

## Request lifecycle (a read)

Illustrative — say you've built an `orders` service with an `Order` entity (no such service ships):
1. `GET /api/orders/:id` → `HttpJwtGuard` verifies the bearer token → `@CurrentUser()` yields `IdentityContext`.
2. Gateway: `nats.send(OrderPatterns.GetById, envelope(identity, { id }))`.
3. orders service `@MessagePattern(OrderPatterns.GetById)` → `GetOrderUseCase` → `OrderRepositoryPort.findById`.
4. `OrderRepository` → `OrderCacheStore.findById` (Redis hit returns; miss loads Postgres + populates Redis) → maps snapshot → `Order`.
5. Controller maps `Order` → `OrderResponse`, returns over NATS → gateway returns JSON.

A write is the same but the repository's `save` persists then invalidates the cache key, so the next read repopulates with fresh data.

## Error propagation

NATS only serializes `error.message`, so status codes would be lost. The convention:

- Internal services throw normal Nest `HttpException`s (`NotFoundException`, `ConflictException`, …).
- Each service installs `HttpToRpcExceptionFilter` (in `main.ts`), which rewraps an `HttpException` as an `RpcException` carrying `{ statusCode, message, error }`.
- The gateway's `NatsGatewayAdapter` normalizes the wire error (timeout → 504, serialized error keeps its status), and the gateway's global `RpcToHttpFilter` turns it back into the right HTTP response.

So: throw a normal `HttpException` in a use case and the client gets the correct HTTP status — no manual status plumbing.

## Identity propagation

Auth happens once, at the gateway. The verified `JwtPayload` becomes an `IdentityContext { userId, email, roles }`, carried in every message as `RequestEnvelope<T> = { identity, payload, meta? }`. Services read `env.identity` and trust it. Keep `userId`/roles **out of payload DTOs** — identity rides in the envelope, payload is just the request data. The orchestrator forwards the same identity into each saga step.

## Why these libraries (and where the boundary is)

- `@beta/core` — DDD primitives, framework-free, so the `domain/` layer can use them without importing Nest.
- `@beta/contracts` — the shared wire vocabulary. If two processes exchange it, it belongs here. Domain entities do **not** belong here.
- `@beta/nats` — transport plumbing kept separate from the data contracts, so a pure-DTO consumer needn't pull in `@nestjs/microservices`.
- `@beta/cache` — the cache port + Redis adapter, independently usable.
- `@beta/persistence` — `BaseEntity`, the TypeORM options factory, and `CachedRepository` (depends on `@beta/cache`).
- `@beta/saga` — orchestration abstractions + durable state (depends on `@beta/persistence`).

Dependency DAG (ESLint-enforced via tags): `core → ∅`, `contracts → core`, `nats(transport) → contracts/core`, `cache`/`persistence`(infra) `→ core/infra`, `saga → core/infra`, `apps → anything`.

## Anti-patterns (do NOT do these)

- ❌ Add an HTTP controller (`@Get`/`@Post`) to an internal service. Only the gateway speaks HTTP.
- ❌ Inject a TypeORM `Repository` (or call `DataSource`) from a use case or controller. Go through the domain repository port.
- ❌ Import anything from `infrastructure/` (or `typeorm`/`ioredis`/`@nestjs/*`) inside `domain/`.
- ❌ Put `userId`/auth fields in a payload DTO, or re-verify the JWT in a downstream service.
- ❌ Cache the rich domain entity. Cache the plain `Snapshot`; map in the repository.
- ❌ Reach into another service's database, or import another service's entities. Communicate over NATS via `@beta/contracts`.
- ❌ Do a cross-service write without a saga (no “just call both and hope”).
- ❌ Relax the ESLint `depConstraints` to silence a module-boundary error. The error means the dependency direction is wrong.
- ❌ Re-implement caching/saga/transport/auth in app code — extend the foundation libs instead.
