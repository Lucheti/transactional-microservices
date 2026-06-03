# Playbook: add a new internal service

A new internal service is a **pure NATS microservice** with its own database. The steps below are a self-contained template — replace `<svc>` (e.g. `billing`) and `<SVC>` (`BILLING`).

## 1. Generate the app

```sh
CI=true npx nx g @nx/nest:app --name=<svc> --directory=apps/<svc> \
  --unitTestRunner=jest --e2eTestRunner=none --tags=scope:<svc>,type:app
```
`--name` is required (nest generators reject a positional name).

## 2. Delete the HTTP boilerplate

```sh
rm -f apps/<svc>/src/app/app.controller.ts apps/<svc>/src/app/app.controller.spec.ts \
      apps/<svc>/src/app/app.service.ts apps/<svc>/src/app/app.service.spec.ts
```

## 3. Build the domain slice

Add at least one entity following `docs/playbooks/add-a-cached-entity.md` (domain / application / infrastructure / presentation under `apps/<svc>/src/app/<feature>/`).

## 4. `app.module.ts`

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@beta/cache';            // only if this service caches
import { NatsClientModule } from '@beta/nats';
import { buildTypeOrmOptions } from '@beta/persistence';
import { <Entity>OrmEntity } from './<feature>/infrastructure/<entity>.orm-entity';
import { <Entity>Module } from './<feature>/presentation/<entity>.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildTypeOrmOptions(config, {
          dbEnv: '<SVC>_DB_NAME',
          defaultDb: 'beta_<svc>',
          entities: [<Entity>OrmEntity],
        }),
    }),
    RedisModule.register(),       // omit if no caching
    NatsClientModule.register(),
    <Entity>Module,
  ],
})
export class AppModule {}
```

## 5. `main.ts`

```ts
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { HttpToRpcExceptionFilter } from '@beta/nats';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const servers = (process.env['NATS_SERVERS'] ?? 'nats://localhost:4222')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.NATS,
    options: { servers, queue: '<svc>' },        // load-balanced queue group
  });
  app.useGlobalFilters(new HttpToRpcExceptionFilter());
  await app.listen();
  Logger.log(`<svc> listening on NATS at ${servers.join(', ')}`);
}
bootstrap();
```

## 6. Wire the database (database-per-service)

- `docker/postgres/init.sql` — add `CREATE DATABASE beta_<svc>;`
- `docker-compose.yml` — add a service block (copy an existing one), with build arg `APP_NAME: <svc>` and env: `NATS_SERVERS`, `REDIS_URL` + `CACHE_TTL_SECONDS` (if caching), `DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD`, `<SVC>_DB_NAME: beta_<svc>`, `DB_SYNCHRONIZE: 'true'`. `depends_on` nats/redis/postgres healthy. Add `<svc>` to the gateway's `depends_on`.
- `.env.example` — add `<SVC>_DB_NAME=beta_<svc>` (for local non-docker runs).

No Dockerfile change: it builds any app via the `APP_NAME` build-arg.

## 7. Verify

```sh
npx nx build <svc>
docker compose up -d nats redis postgres
npx nx serve <svc>     # expect module-init logs; "listening on NATS"; no DI errors
```
Then expose an endpoint via the gateway (`docs/playbooks/add-a-gateway-endpoint.md`) and exercise it. Final gate: `npx nx run-many -t build test lint`.

## Don't

- Don't add an HTTP server or `@Get`/`@Post` controllers — internal services are NATS-only.
- Don't share a database with another service or read its tables — call it over NATS.
- Don't forget the `type:app` tag (keeps the dependency DAG enforced) and the `init.sql` + compose entries (the DB won't exist otherwise).
