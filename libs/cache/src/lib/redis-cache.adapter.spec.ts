import type { Redis } from 'ioredis';
import type { CacheModuleOptions } from './cache-tokens';
import { RedisCacheAdapter } from './redis-cache.adapter';

class FakeRedis {
  store = new Map<string, string>();
  lastSetArgs: unknown[] = [];
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string, ...rest: unknown[]): Promise<string> {
    this.store.set(key, value);
    this.lastSetArgs = [key, value, ...rest];
    return 'OK';
  }
  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

const options: CacheModuleOptions = { defaultTtlSeconds: 30 };
const adapterFor = (redis: unknown) =>
  new RedisCacheAdapter(redis as Redis, options);

describe('RedisCacheAdapter', () => {
  it('JSON-serializes values and round-trips them', async () => {
    const redis = new FakeRedis();
    const adapter = adapterFor(redis);
    await adapter.set('k', { a: 1 });
    expect(redis.store.get('k')).toBe(JSON.stringify({ a: 1 }));
    expect(await adapter.get<{ a: number }>('k')).toEqual({ a: 1 });
  });

  it('applies the default TTL via SET ... EX', async () => {
    const redis = new FakeRedis();
    await adapterFor(redis).set('k', 'v');
    expect(redis.lastSetArgs).toEqual(['k', JSON.stringify('v'), 'EX', 30]);
  });

  it('returns null on a miss', async () => {
    expect(await adapterFor(new FakeRedis()).get('missing')).toBeNull();
  });

  it('degrades to a miss when the client throws', async () => {
    const throwing = {
      get: async () => {
        throw new Error('redis down');
      },
    };
    expect(await adapterFor(throwing).get('k')).toBeNull();
  });
});
