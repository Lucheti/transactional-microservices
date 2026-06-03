import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NatsClientModule, NatsGatewayAdapter } from '@beta/nats';
import { GatewayAuthModule } from './auth/auth.module';
import { DevController } from './dev/dev.controller';

/**
 * The platform's single HTTP entry point and only JWT verifier. Auth and a
 * dev-only token endpoint are wired; add domain controllers that forward to
 * services through NatsGatewayAdapter (see docs/playbooks/add-a-gateway-endpoint.md).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    NatsClientModule.register(),
    GatewayAuthModule,
  ],
  controllers: [DevController],
  providers: [NatsGatewayAdapter],
})
export class AppModule {}
