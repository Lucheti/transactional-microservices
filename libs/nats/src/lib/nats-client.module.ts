import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { NATS_CLIENT } from './nats-tokens';

/**
 * Registers the shared NATS ClientProxy once, globally. Any provider can then
 * inject NATS_CLIENT to send commands / emit events. Reads NATS_SERVERS
 * (comma-separated) from env.
 */
@Module({})
export class NatsClientModule {
  static register(): DynamicModule {
    const servers = (process.env['NATS_SERVERS'] ?? 'nats://localhost:4222')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      module: NatsClientModule,
      global: true,
      imports: [
        ClientsModule.register([
          {
            name: NATS_CLIENT,
            transport: Transport.NATS,
            options: { servers },
          },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}
