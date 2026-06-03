import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { CachePort } from './cache.port';
import { CACHE_OPTIONS, REDIS_CLIENT } from './cache-tokens';
import type { CacheModuleOptions } from './cache-tokens';

/**
 * ioredis-backed CachePort. Values are JSON-serialized. Cache failures degrade
 * gracefully (a failed read becomes a miss, a failed write is swallowed) so a
 * transient Redis outage never takes down a request — Postgres stays the
 * source of truth.
 */
@Injectable()
export class RedisCacheAdapter implements CachePort {
  private readonly logger = new Logger(RedisCacheAdapter.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(CACHE_OPTIONS) private readonly options: CacheModuleOptions,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`cache get failed for "${key}": ${(err as Error).message}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.options.defaultTtlSeconds;
    try {
      const raw = JSON.stringify(value);
      if (ttl > 0) {
        await this.redis.set(key, raw, 'EX', ttl);
      } else {
        await this.redis.set(key, raw);
      }
    } catch (err) {
      this.logger.warn(`cache set failed for "${key}": ${(err as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(`cache del failed for "${key}": ${(err as Error).message}`);
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    try {
      // SCAN (not KEYS) so we never block Redis on large keyspaces.
      const stream = this.redis.scanStream({ match: `${prefix}*`, count: 100 });
      const pipeline = this.redis.pipeline();
      let hasKeys = false;
      for await (const chunk of stream) {
        for (const key of chunk as string[]) {
          pipeline.del(key);
          hasKeys = true;
        }
      }
      if (hasKeys) {
        await pipeline.exec();
      }
    } catch (err) {
      this.logger.warn(
        `cache delByPrefix failed for "${prefix}": ${(err as Error).message}`,
      );
    }
  }
}
