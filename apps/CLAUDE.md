# Working inside apps/

Every app here is a deployable. **`api-gateway` is the only HTTP app** — it's the single entry point and the only JWT verifier. Every other app (the `orchestrator`, and any service you add) is a **pure NATS microservice**: no HTTP, controllers use `@MessagePattern`, never `@Get`/`@Post`.

Full recipes with copy-paste templates live in `docs/playbooks/`. This file is the in-context summary of the rules. (There are no example domain slices in the repo — the foundation ships clean.)

## Service layout (hexagonal)

```
<feature>/
  domain/          <Entity> (extends @beta/core AggregateRoot) + <Entity>Snapshot interface;
                   <Entity>RepositoryPort + a Symbol token. PURE — no @nestjs, typeorm, ioredis, or nats imports.
  application/     use cases (@Injectable). Inject ports via @Inject(TOKEN). Throw Nest HttpExceptions
                   (NotFound/Conflict/BadRequest) for expected failures. No infrastructure imports here.
  infrastructure/  TypeORM @Entity (extends @beta/persistence BaseEntity);
                   <Entity>CacheStore extends CachedRepository<Snapshot> (the cache-aside adapter);
                   <Entity>Repository implements the port by composing the store + mapping snapshot↔domain;
                   NATS event publisher (if it emits events).
  presentation/    @MessagePattern controller — reads RequestEnvelope, delegates to use cases, maps to a
                   response DTO; the feature module binds ports → adapters.
```

## Rules

- **Dependencies point inward.** `presentation → application → domain`; `infrastructure` implements `domain` ports. Never import `infrastructure` from `domain` or `application`.
- **Bind every port** in the feature module: `{ provide: ENTITY_REPOSITORY, useClass: EntityRepository }`. Use cases depend on the interface + token, never the concrete adapter or TypeORM.
- **Cache-aside lives in the CacheStore**, not in use cases/controllers. Reads go through the repository port; writes (save/delete) invalidate automatically.
- **Database-per-service.** Each service owns its own DB (its own `*_DB_NAME` env). Never query another service's DB — call it over NATS.
- **`app.module.ts`** wires: `ConfigModule.forRoot({ isGlobal: true })`, `TypeOrmModule.forRootAsync` via `buildTypeOrmOptions(config, { dbEnv, defaultDb, entities })`, `RedisModule.register()` (only if the service caches), `NatsClientModule.register()`, and the feature module.
- **`main.ts`** for an internal service: `NestFactory.createMicroservice(AppModule, { transport: Transport.NATS, options: { servers, queue: '<service>' } })` then `app.useGlobalFilters(new HttpToRpcExceptionFilter())`. The gateway's `main.ts` is the hybrid exception (HTTP + `connectMicroservice`).
- **Identity:** controllers receive `RequestEnvelope<T>`; read `env.identity` (trusted) and `env.payload`. Never expect a raw DTO.
- After generating an app, delete the boilerplate `app.controller.ts` / `app.service.ts` (+ their specs).

## Which app, which playbook

- **`orchestrator`** is the home for **sagas** — multi-service workflows that must roll back on partial failure. If a new feature changes state across two or more services, build a saga here; don't chain cross-service `nats.send` calls from a controller/use case. → `docs/playbooks/add-a-saga.md`
- A service that **reacts to events** from others uses `@EventPattern`. → `docs/playbooks/add-an-event.md`

Playbooks: new service `docs/playbooks/add-a-service.md` · new entity `docs/playbooks/add-a-cached-entity.md` · saga `docs/playbooks/add-a-saga.md` · event consumer `docs/playbooks/add-an-event.md` · HTTP endpoint `docs/playbooks/add-a-gateway-endpoint.md`
