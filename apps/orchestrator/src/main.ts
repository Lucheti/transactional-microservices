import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { HttpToRpcExceptionFilter } from '@beta/nats';
import { AppModule } from './app/app.module';

// Dedicated saga coordinator — a pure NATS microservice that owns the saga DB.
async function bootstrap() {
  const servers = (process.env['NATS_SERVERS'] ?? 'nats://localhost:4222')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.NATS,
    options: { servers, queue: 'orchestrator' },
  });

  app.useGlobalFilters(new HttpToRpcExceptionFilter());
  await app.listen();
  Logger.log(`orchestrator listening on NATS at ${servers.join(', ')}`);
}

bootstrap();
