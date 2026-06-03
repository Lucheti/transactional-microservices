import type { CachePort } from '@beta/cache';

/**
 * Generic, memory-first (cache-aside) repository base.
 *
 *  read  →  look in the cache first; on a miss, load from the DB and
 *           populate the cache, then return.
 *  write →  persist to the DB, then INVALIDATE (delete) the cached entry and
 *           the list cache, so the next read repopulates from the source of
 *           truth with the new data.
 *
 * All caching behavior lives here, once. Concrete repositories only supply the
 * DB access and a cache-key prefix via the protected abstract hooks — so a
 * domain repository gets transparent caching just by extending this class.
 */
export abstract class CachedRepository<T extends { id: string }> {
  protected constructor(
    protected readonly cache: CachePort,
    protected readonly ttlSeconds?: number,
  ) {}

  async findById(id: string): Promise<T | null> {
    const key = this.entityKey(id);

    const cached = await this.cache.get<T>(key);
    if (cached !== null) {
      return cached; // cache hit
    }

    const entity = await this.fetchByIdFromDb(id); // cache miss → source of truth
    if (entity !== null) {
      await this.cache.set(key, entity, this.ttlSeconds); // populate
    }
    return entity;
  }

  async findAll(): Promise<T[]> {
    const key = this.listKey();

    const cached = await this.cache.get<T[]>(key);
    if (cached !== null) {
      return cached;
    }

    const entities = await this.fetchAllFromDb();
    await this.cache.set(key, entities, this.ttlSeconds);
    return entities;
  }

  async save(entity: T): Promise<T> {
    const saved = await this.persistToDb(entity);
    await this.invalidate(saved.id);
    return saved;
  }

  async delete(id: string): Promise<void> {
    await this.removeFromDb(id);
    await this.invalidate(id);
  }

  /** Drops the entity's cached entry and the list cache for this type. */
  protected async invalidate(id: string): Promise<void> {
    await this.cache.del(this.entityKey(id));
    await this.cache.del(this.listKey());
  }

  protected entityKey(id: string): string {
    return `${this.cacheKeyPrefix()}:${id}`;
  }

  protected listKey(): string {
    return `${this.cacheKeyPrefix()}:list`;
  }

  // --- entity-specific hooks implemented by concrete repositories ---

  /** Stable, unique cache-key prefix for this entity type, e.g. "widget". */
  protected abstract cacheKeyPrefix(): string;
  protected abstract fetchByIdFromDb(id: string): Promise<T | null>;
  protected abstract fetchAllFromDb(): Promise<T[]>;
  protected abstract persistToDb(entity: T): Promise<T>;
  protected abstract removeFromDb(id: string): Promise<void>;
}
