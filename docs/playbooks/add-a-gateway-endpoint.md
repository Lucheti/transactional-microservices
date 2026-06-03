# Playbook: add a gateway HTTP endpoint

Exposes an internal service's capability over HTTP. The gateway authenticates, then forwards to the service over NATS inside an identity envelope. The snippets below are a self-contained template.

> **One endpoint forwards to one service.** If serving the request means changing state in **two or more services** that must roll back together, do **not** chain `nats.send` calls here (no rollback) — model it as a saga in the `orchestrator` and have this endpoint trigger that single saga. See `add-a-saga.md`.

## 1. Contract (`@beta/contracts`)

- Add (or reuse) the NATS subject in `patterns/<resource>.patterns.ts`.
- Request body from HTTP → a **DTO class** with `class-validator` decorators (the gateway validates it). Response → an interface. Internal-only fields stay out of the request DTO; identity is never in the body.
- Export anything new from `libs/contracts/src/index.ts`.

```ts
// dtos/<resource>.dto.ts
export class Create<Thing>Request {
  @IsString() @IsNotEmpty() name!: string;
}
export interface <Thing>Response { id: string; /* … */ }
```

## 2. Gateway controller (`apps/api-gateway/src/app/<resource>/<resource>.controller.ts`)

Guard the controller, take the identity via `@CurrentUser()`, forward with `NatsGatewayAdapter.send(pattern, envelope(identity, payload))`.

```ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Create<Thing>Request, IdentityContext, <Thing>Patterns, <Thing>Response, envelope } from '@beta/contracts';
import { NatsGatewayAdapter } from '@beta/nats';
import { CurrentUser } from '../auth/current-user.decorator';
import { HttpJwtGuard } from '../auth/http-jwt.guard';

@UseGuards(HttpJwtGuard)
@Controller('<things>')
export class <Thing>GatewayController {
  constructor(private readonly nats: NatsGatewayAdapter) {}

  @Post()
  create(@CurrentUser() identity: IdentityContext, @Body() body: Create<Thing>Request): Promise<<Thing>Response> {
    return this.nats.send<<Thing>Response>(<Thing>Patterns.Create, envelope(identity, body));
  }

  @Get(':id')
  getById(@CurrentUser() identity: IdentityContext, @Param('id') id: string): Promise<<Thing>Response> {
    return this.nats.send<<Thing>Response>(<Thing>Patterns.GetById, envelope(identity, { id }));
  }
}
```

- For a longer-running call (e.g. a saga), pass a bigger timeout as the 3rd arg: `this.nats.send(p, env, 15000)`.
- `@CurrentUser()` returns the `IdentityContext`; `envelope(identity, payload, meta?)` wraps it for the wire.

## 3. Register the controller

Add it to the gateway's `apps/api-gateway/src/app/app.module.ts` `controllers: [...]`. (`NatsGatewayAdapter` is already provided there; `HttpJwtGuard`/JWT come from the global `GatewayAuthModule`.)

## 4. Service side

The target service must handle the subject (see `docs/playbooks/add-a-cached-entity.md` → presentation): a `@MessagePattern(<Thing>Patterns.X)` reading `RequestEnvelope<…>`.

## What you get for free

- **Validation:** the gateway's global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) rejects bad bodies with 400 before they hit NATS.
- **Auth:** `HttpJwtGuard` 401s missing/invalid tokens; downstream gets a trusted `identity`.
- **Errors:** an `HttpException` thrown in the service comes back as the correct HTTP status (filters + `NatsGatewayAdapter` handle the translation); a service timeout → 504.

## Verify

`npx nx build api-gateway`, run the stack, then:
```sh
TOKEN=$(curl -s -X POST localhost:3000/api/dev/token -H 'content-type: application/json' \
  --data '{"email":"dev@beta.local","roles":["user"]}' | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).accessToken))')
curl -s -X POST localhost:3000/api/<things> -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' --data '{"name":"x"}'
```
(Build JSON bodies with `printf`/`--data`, not hand-escaped quotes, and pass `curl --globoff` when a body contains `{}`.)

## Don't

- Don't expose internal services directly — HTTP only on the gateway.
- Don't read the JWT or `userId` from the body; use `@CurrentUser()` + the envelope.
- Don't inject `NATS_CLIENT` raw to call services — use `NatsGatewayAdapter` (timeout + error mapping).
