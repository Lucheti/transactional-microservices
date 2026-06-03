import { hostname } from 'node:os';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { RpcToHttpFilter } from '@beta/nats';
import { AppModule } from './app/app.module';

/**
 * Hybrid app: the only HTTP surface in the platform AND a NATS subscriber (a
 * per-pod queue group so it can receive broadcast events in the future). All
 * business logic lives behind NATS in the internal services.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const servers = (process.env['NATS_SERVERS'] ?? 'nats://localhost:4222')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.NATS,
    options: { servers, queue: `api-gateway:${hostname()}:${process.pid}` },
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new RpcToHttpFilter());

  await app.startAllMicroservices();
  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
  Logger.log(`api-gateway running on http://localhost:${port}/api`);
}

bootstrap();
