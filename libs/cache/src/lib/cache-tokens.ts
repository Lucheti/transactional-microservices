export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const CACHE_OPTIONS = Symbol('CACHE_OPTIONS');

export interface CacheModuleOptions {
  /** Default TTL (seconds) applied when a caller does not specify one. */
  defaultTtlSeconds: number;
}
