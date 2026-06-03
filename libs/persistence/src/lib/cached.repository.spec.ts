import { CachePort } from '@beta/cache';
import { CachedRepository } from './cached.repository';

interface Foo {
  id: string;
  name: string;
}

/** In-memory CachePort so the cache-aside logic can be tested without Redis. */
class InMemoryCache implements CachePort {
  private store = new Map<string, string>();
  async get<T>(key: string): Promise<T | null> {
    const raw = this.store.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, JSON.stringify(value));
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
  async delByPrefix(prefix: string): Promise<void> {
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }
  has(key: string): boolean {
    return this.store.has(key);
  }
}

class FooRepository extends CachedRepository<Foo> {
  db = new Map<string, Foo>();
  fetchByIdCalls = 0;
  constructor(cache: CachePort) {
    super(cache);
  }
  protected cacheKeyPrefix(): string {
    return 'foo';
  }
  protected async fetchByIdFromDb(id: string): Promise<Foo | null> {
    this.fetchByIdCalls++;
    return this.db.get(id) ?? null;
  }
  protected async fetchAllFromDb(): Promise<Foo[]> {
    return [...this.db.values()];
  }
  protected async persistToDb(entity: Foo): Promise<Foo> {
    this.db.set(entity.id, entity);
    return entity;
  }
  protected async removeFromDb(id: string): Promise<void> {
    this.db.delete(id);
  }
}

describe('CachedRepository (memory-first cache-aside)', () => {
  let cache: InMemoryCache;
  let repo: FooRepository;

  beforeEach(() => {
    cache = new InMemoryCache();
    repo = new FooRepository(cache);
    repo.db.set('1', { id: '1', name: 'one' });
  });

  it('on a miss, loads from the DB and populates the cache', async () => {
    const result = await repo.findById('1');
    expect(result?.name).toBe('one');
    expect(repo.fetchByIdCalls).toBe(1);
    expect(cache.has('foo:1')).toBe(true);
  });

  it('on a hit, serves from cache without touching the DB', async () => {
    await repo.findById('1'); // warm
    const again = await repo.findById('1');
    expect(again?.name).toBe('one');
    expect(repo.fetchByIdCalls).toBe(1); // DB hit only once
  });

  it('invalidates the entry on save so the next read refetches new data', async () => {
    await repo.findById('1'); // warm
    expect(repo.fetchByIdCalls).toBe(1);

    await repo.save({ id: '1', name: 'updated' }); // write → invalidate
    expect(cache.has('foo:1')).toBe(false);

    const after = await repo.findById('1'); // miss → DB again
    expect(after?.name).toBe('updated');
    expect(repo.fetchByIdCalls).toBe(2);
  });

  it('invalidates the list cache on save', async () => {
    await repo.findAll();
    expect(cache.has('foo:list')).toBe(true);
    await repo.save({ id: '2', name: 'two' });
    expect(cache.has('foo:list')).toBe(false);
  });

  it('invalidates on delete', async () => {
    await repo.findById('1');
    expect(cache.has('foo:1')).toBe(true);
    await repo.delete('1');
    expect(cache.has('foo:1')).toBe(false);
  });
});
