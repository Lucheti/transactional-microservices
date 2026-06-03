import { DynamicModule, Global, Logger, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CACHE_PORT } from './cache.port';
import { CACHE_OPTIONS, CacheModuleOptions, REDIS_CLIENT } from './cache-tokens';
import { RedisCacheAdapter } from './redis-cache.adapter';

/**
 * Global module wiring a singleton ioredis client and exposing it behind the
 * CachePort. Register once per app: `RedisModule.register()`.
 *
 * Reads REDIS_URL and CACHE_TTL_SECONDS from config.
 */
@Global()
@Module({})
export class RedisModule {
  static register(): DynamicModule {
    const redisProvider: Provider = {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger(RedisModule.name);
        const client = new Redis(
          config.get<string>('REDIS_URL', 'redis://localhost:6379'),
          { maxRetriesPerRequest: 3, lazyConnect: false },
        );
        // Attach an error handler so a connection blip is logged rather than
        // surfacing as an unhandled 'error' event.
        client.on('error', (err: Error) =>
          logger.warn(`redis connection error: ${err.message}`),
        );
        return client;
      },
    };

    const optionsProvider: Provider = {
      provide: CACHE_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): CacheModuleOptions => ({
        defaultTtlSeconds: Number(config.get<string>('CACHE_TTL_SECONDS', '60')),
      }),
    };

    return {
      module: RedisModule,
      imports: [ConfigModule],
      providers: [
        redisProvider,
        optionsProvider,
        { provide: CACHE_PORT, useClass: RedisCacheAdapter },
      ],
      exports: [CACHE_PORT, REDIS_CLIENT],
    };
  }
}
