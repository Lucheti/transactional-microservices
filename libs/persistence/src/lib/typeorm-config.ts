import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export interface TypeOrmFactoryOptions {
  /** Env var holding this service's database name (database-per-service). */
  dbEnv: string;
  /** Fallback database name when the env var is unset (local dev). */
  defaultDb: string;
  /** Entity classes owned by this service. */
  entities: TypeOrmModuleOptions['entities'];
}

/**
 * Builds Postgres TypeOrmModule options for a service from env config, so
 * every service wires persistence identically instead of copy-pasting a
 * forRootAsync factory. Each service points `dbEnv` at its own database
 * (database-per-service); the host/credentials are shared infra config.
 */
export function buildTypeOrmOptions(
  config: ConfigService,
  options: TypeOrmFactoryOptions,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST', 'localhost'),
    port: Number(config.get<string>('DB_PORT', '5432')),
    username: config.get<string>('DB_USERNAME', 'beta'),
    password: config.get<string>('DB_PASSWORD', 'beta'),
    database: config.get<string>(options.dbEnv, options.defaultDb),
    entities: options.entities,
    // Dev-only convenience; switch to migrations before any real deployment.
    synchronize: config.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
  };
}
