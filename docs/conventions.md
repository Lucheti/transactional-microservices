# Conventions

Concrete rules and the non-obvious gotchas. When in doubt, follow the templates in `docs/playbooks/` — the snippets below use `Widget`/`widget` only as illustrative names.

## Naming & files

- **Files:** kebab-case with a role suffix: `widget.entity.ts`, `widget.repository.port.ts`, `widget.cache-store.ts`, `widget.orm-entity.ts`, `create-widget.usecase.ts`, `widget.controller.ts`, `widget.module.ts`, `*.spec.ts`.
- **Classes:** PascalCase. Use cases end in `UseCase`; ports end in `Port`; the TypeORM model ends in `OrmEntity`; the cache-aside adapter ends in `CacheStore`; the domain repo ends in `Repository`.
- **NATS subjects:** `<resource>.<action>` (e.g. `order.get-by-id`, `order.reserve`), defined as `as const` objects in `@beta/contracts` (e.g. `OrderPatterns`).
- **Databases:** `beta_<service>` (e.g. `beta_orders`; the orchestrator uses `beta_saga`). Env var: `<SERVICE>_DB_NAME`.
- **One concept per file.** A use case per file; a step per file.

## Dependency injection

- **Ports use Symbol tokens**, declared next to the interface:
  ```ts
  export interface WidgetRepositoryPort { /* … */ }
  export const WIDGET_REPOSITORY = Symbol('WIDGET_REPOSITORY');
  ```
- **Inject by token, type by interface:**
  ```ts
  constructor(@Inject(WIDGET_REPOSITORY) private readonly widgets: WidgetRepositoryPort) {}
  ```
- **Bind in the module:** `{ provide: WIDGET_REPOSITORY, useClass: WidgetRepository }`. For an already-provided class implementing a port, use `useExisting` (see `SagaPersistenceModule`).
- Concrete collaborators that aren't ports (e.g. an entity's cache store, or `NatsGatewayAdapter`) are plain class providers — list them in `providers` and inject by class.
- Globally available without importing: `ConfigService` (ConfigModule is `isGlobal`), `NATS_CLIENT` (NatsClientModule is global), `CACHE_PORT` (RedisModule is `@Global`).

## TypeScript

- **`import type` for type-only cross-module imports.** Ports, snapshots, contract interfaces, `CachePort`, `SagaStateStore`, etc. should be imported as types. `isolatedModules` is on; a value import of a type can leave a dead `require()` (or fail to elide). Mixed imports are fine when at least one name is a value:
  ```ts
  import { CACHE_PORT } from '@beta/cache';        // value (token)
  import type { CachePort } from '@beta/cache';     // type
  ```
- **`override` when overriding a concrete/optional member.** `noImplicitOverride` is on. A `SagaStep`'s `compensate()` overrides the optional base method, so it needs `override`; implementing an *abstract* member (`execute`, `name`) does **not**.
- **Cross-lib imports use the `@beta/*` alias**; within a project use relative paths.
- **Strict mode is on.** Use `!` only on TypeORM entity columns (`name!: string`), not to dodge real null checks.

## Domain modeling

- Entities extend `AggregateRoot<TId>` from `@beta/core` and keep state in a private `props`. Expose intention-revealing getters; mutate through behavior methods (`reserve()`, `release()`), not setters.
- Construction goes through a static factory returning `Result` (validate invariants with `Guard`); don't throw from constructors. The use case turns a failed `Result` into the right `HttpException`.
- Every entity has a `Snapshot` interface (plain, serializable) + `static fromSnapshot()` / `toSnapshot()`. The snapshot is what gets cached and persisted.

## Error handling

- Use cases throw standard Nest `HttpException`s for expected failures (`NotFoundException`, `ConflictException`, `BadRequestException`). The filters carry the status across NATS back to HTTP (see `docs/architecture.md` → Error propagation). Don't hand-roll status codes or error envelopes.

## Contracts & messaging

- A request/response that originates from HTTP gets a **DTO class** with `class-validator` decorators (validated by the gateway's `ValidationPipe`). Internal server-to-server message payloads are plain **interfaces** (not re-validated).
- Responses are interfaces; controllers map domain → response explicitly (a private `toResponse()`), never return the entity.
- Identity travels in `RequestEnvelope.identity`, not in payload DTOs.

## Config

- `ConfigModule.forRoot({ isGlobal: true })` in every `app.module.ts`. Read via `ConfigService.get<string>('KEY', default)`. Add new keys to `.env.example` and the service's `docker-compose.yml` block.

## Testing

- `npx nx run-many -t test`. Test runner is Jest via `@nx/jest`. `jest.preset.js` contains a `pathsToModuleNameMapper` so `@beta/*` resolves in tests — **do not remove it** or cross-lib imports break.
- Put `*.spec.ts` next to the unit. Import the unit-under-test by **relative** path; import other libs via `@beta/*`.
- Test against fakes, not infra. Patterns already in the repo:
  - Cache-aside: `InMemoryCache implements CachePort` (see `libs/persistence/src/lib/cached.repository.spec.ts`).
  - Saga: in-memory `SagaStateStore` + recording `SagaStep`s (see `libs/saga/src/lib/saga-orchestrator.spec.ts`).
  - Use cases: a hand-written stub of the repository port.
- What's worth testing: domain factories/invariants (`Result`), use-case branching, anything in the foundation libs. Thin controllers and mappers usually don't need their own tests.

## Build / generator gotchas (learned the hard way)

- **`@nx/nest:app` and `@nx/nest:lib` reject a positional name — pass `--name=<n>`.** (`@nx/js:lib` accepts positional.)
- **Prefix generators/builds with `CI=true`** to avoid interactive prompts in non-TTY shells.
- New **library** → `@nx/nest:lib --buildable --importPath=@beta/<name> --tags=…`; framework-free lib → `@nx/js:lib --bundler=tsc`. Set the right `type:` tag so the dependency DAG stays enforced (`type:core|contracts|transport|infra|saga`).
- After `@nx/nest:app`, delete the generated `app.controller.ts`/`app.service.ts` + specs; you'll replace `app.module.ts` and `main.ts`.
- Apps build with webpack (`dist/apps/<app>/main.js`, deps kept external); buildable libs compile with `tsc`. Both resolve `@beta/*` via `tsconfig.base.json` paths.
- A successful build does **not** prove runtime DI. Smoke-test with `npx nx serve <app>` (or `node dist/apps/<app>/main.js`): module-init logs then connection errors = DI is fine; a "Nest can't resolve dependencies of X" = a missing/un-bound provider.
