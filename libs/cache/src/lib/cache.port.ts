/**
 * Abstraction over the cache layer consumed by the memory-first
 * CachedRepository. Application/infrastructure code depends on this port,
 * never on ioredis directly — so the cache technology can be swapped without
 * touching the data-access logic.
 */
export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Deletes every key matching `${prefix}*` — used to invalidate list caches. */
  delByPrefix(prefix: string): Promise<void>;
}

export const CACHE_PORT = Symbol('CACHE_PORT');
