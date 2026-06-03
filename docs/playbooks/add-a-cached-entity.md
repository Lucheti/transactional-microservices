# Playbook: add a cached entity (with cache-aside persistence)

Adds a domain entity to an existing service, persisted in Postgres and cached in Redis via the generic `CachedRepository` — reads are Redis-first, writes invalidate. The templates below are self-contained; `<Entity>` is a placeholder.

Below, `<feature>` is the folder (e.g. `order`), `<Entity>` the class (`Order`), `<entity>` the lowercase (`order`). Files go under `apps/<service>/src/app/<feature>/`.

## 1. Domain — `domain/<entity>.entity.ts`

Pure TypeScript. State in `props`; a `Snapshot` for persistence/cache; a factory returning `Result`.

```ts
import { AggregateRoot, Guard, Result } from '@beta/core';

export interface <Entity>Snapshot {
  id: string;
  // …plain serializable fields
}

interface <Entity>Props {
  // …same fields minus id
}

export class <Entity> extends AggregateRoot<string> {
  private props: <Entity>Props;
  private constructor(id: string, props: <Entity>Props) { super(id); this.props = props; }

  // intention-revealing getters
  get someField(): string { return this.props.someField; }

  static create(input: { id: string; /* … */ }): Result<<Entity>> {
    const guard = Guard.combine([ Guard.againstEmpty(input.id, 'id') /* , … */ ]);
    if (guard.isFailure) return Result.fail(guard.getError());
    return Result.ok(new <Entity>(input.id, { /* … */ }));
  }

  static fromSnapshot(s: <Entity>Snapshot): <Entity> { return new <Entity>(s.id, { /* … */ }); }
  toSnapshot(): <Entity>Snapshot { return { id: this.id, /* … */ }; }

  // behavior methods that protect invariants (return Result when they can fail)
}
```

## 2. Domain — `domain/<entity>.repository.port.ts`

```ts
import type { <Entity> } from './<entity>.entity';

export interface <Entity>RepositoryPort {
  findById(id: string): Promise<<Entity> | null>;
  findAll(): Promise<<Entity>[]>;
  save(entity: <Entity>): Promise<<Entity>>;
  delete(id: string): Promise<void>;
}

export const <ENTITY>_REPOSITORY = Symbol('<ENTITY>_REPOSITORY');
```

## 3. Infrastructure — `infrastructure/<entity>.orm-entity.ts`

```ts
import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@beta/persistence';

@Entity('<entity>s')
export class <Entity>OrmEntity extends BaseEntity {  // BaseEntity gives id, createdAt, updatedAt
  @Column({ type: 'varchar' }) someField!: string;
}
```

## 4. Infrastructure — `infrastructure/<entity>.cache-store.ts` (the cache-aside adapter)

Extend `CachedRepository<Snapshot>` and supply the DB hooks + key prefix. All cache logic is inherited.

```ts
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_PORT } from '@beta/cache';
import type { CachePort } from '@beta/cache';
import { CachedRepository } from '@beta/persistence';
import type { <Entity>Snapshot } from '../domain/<entity>.entity';
import { <Entity>OrmEntity } from './<entity>.orm-entity';

@Injectable()
export class <Entity>CacheStore extends CachedRepository<<Entity>Snapshot> {
  constructor(
    @InjectRepository(<Entity>OrmEntity) private readonly repo: Repository<<Entity>OrmEntity>,
    @Inject(CACHE_PORT) cache: CachePort,
    config: ConfigService,
  ) {
    super(cache, Number(config.get<string>('CACHE_TTL_SECONDS', '60')));
  }

  protected cacheKeyPrefix(): string { return '<entity>'; }
  protected async fetchByIdFromDb(id: string) { const r = await this.repo.findOne({ where: { id } }); return r ? this.toSnapshot(r) : null; }
  protected async fetchAllFromDb() { return (await this.repo.find()).map((r) => this.toSnapshot(r)); }
  protected async persistToDb(s: <Entity>Snapshot) { return this.toSnapshot(await this.repo.save(this.repo.create(s))); }
  protected async removeFromDb(id: string) { await this.repo.delete(id); }

  private toSnapshot(r: <Entity>OrmEntity): <Entity>Snapshot { return { id: r.id, /* … */ }; }
}
```

## 5. Infrastructure — `infrastructure/<entity>.repository.ts` (domain port impl, by composition)

```ts
import { Injectable } from '@nestjs/common';
import { <Entity> } from '../domain/<entity>.entity';
import type { <Entity>RepositoryPort } from '../domain/<entity>.repository.port';
import { <Entity>CacheStore } from './<entity>.cache-store';

@Injectable()
export class <Entity>Repository implements <Entity>RepositoryPort {
  constructor(private readonly store: <Entity>CacheStore) {}
  async findById(id: string) { const s = await this.store.findById(id); return s ? <Entity>.fromSnapshot(s) : null; }
  async findAll() { return (await this.store.findAll()).map((s) => <Entity>.fromSnapshot(s)); }
  async save(e: <Entity>) { return <Entity>.fromSnapshot(await this.store.save(e.toSnapshot())); }
  delete(id: string) { return this.store.delete(id); }
}
```

## 6. Application — `application/*.usecase.ts`

Inject the port via the token; throw `HttpException`s for expected failures. Example:

```ts
@Injectable()
export class Get<Entity>UseCase {
  constructor(@Inject(<ENTITY>_REPOSITORY) private readonly repo: <Entity>RepositoryPort) {}
  async execute(id: string): Promise<<Entity>> {
    const e = await this.repo.findById(id);
    if (!e) throw new NotFoundException(`<entity> ${id} not found`);
    return e;
  }
}
```
For create, generate the id with `randomUUID()` from `node:crypto`, call `<Entity>.create(...)`, and throw `BadRequestException(result.getError())` on failure.

## 7. Presentation — controller + module

Controller: `@MessagePattern(<Entity>Patterns.X)` methods take `RequestEnvelope<…>`, delegate to use cases, map to a response DTO via a private `toResponse()`. Module:

```ts
@Module({
  imports: [TypeOrmModule.forFeature([<Entity>OrmEntity])],
  controllers: [<Entity>Controller],
  providers: [
    /* …use cases */,
    <Entity>CacheStore,
    { provide: <ENTITY>_REPOSITORY, useClass: <Entity>Repository },
  ],
})
export class <Entity>Module {}
```
Then add `<Entity>OrmEntity` to the service's `buildTypeOrmOptions({ entities: [...] })` and import `<Entity>Module` in `app.module.ts`.

## 8. Contracts

In `@beta/contracts` add `patterns/<entity>.patterns.ts` (the NATS subjects), `dtos/<entity>.dto.ts` (request DTO classes + response interfaces + internal message interfaces), and export them from `libs/contracts/src/index.ts`.

## Verify

`npx nx build <service>` then `npx nx serve <service>` (DI should resolve). End-to-end: expose it via the gateway (`docs/playbooks/add-a-gateway-endpoint.md`), then create → read twice → check the Redis key `<entity>:<id>` is set → write → confirm the key is cleared. Add a `CachedRepository`-style spec if you added non-trivial behavior.

## Don't

- Don't cache the `<Entity>` itself — cache the `Snapshot`.
- Don't inject `<Entity>CacheStore` or TypeORM into use cases — they depend on `<ENTITY>_REPOSITORY`.
- Don't add caching logic by hand — it's inherited from `CachedRepository`.
