import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NatsClientModule } from '@beta/nats';
import { buildTypeOrmOptions } from '@beta/persistence';
import { SagaState } from '@beta/saga';

/**
 * Saga host. Pre-wired with the saga-state table and NATS, ready to receive
 * saga feature modules (see docs/playbooks/add-a-saga.md). With no saga
 * registered it simply connects and idles.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildTypeOrmOptions(config, {
          dbEnv: 'SAGA_DB_NAME',
          defaultDb: 'beta_saga',
          entities: [SagaState],
        }),
    }),
    NatsClientModule.register(),
  ],
})
export class AppModule {}
