# Playbook: add (or extend) a saga

Use a saga when one logical operation spans multiple services and must be all-or-nothing — you can't use a DB transaction across separate databases. A `SagaOrchestrator` runs ordered `SagaStep`s; if one fails, the already-completed steps are compensated in reverse. State is persisted (resumable). Sagas live in the **`orchestrator`** service, which ships as a ready but empty host — build each saga in its own folder under `apps/orchestrator/src/app/<saga>/`.

Replace `<Saga>` (`Checkout`), `<saga>` (`checkout`).

## 1. Contract (`@beta/contracts`)

Add the trigger subject to `patterns/saga.patterns.ts` and a request/response DTO in `dtos/saga.dto.ts`:

```ts
export const SagaPatterns = { /* … */ Start<Saga>: 'saga.<saga>.start' } as const;

export class Start<Saga>Request { @IsString() someId!: string; /* … */ }
export interface Start<Saga>Response { sagaId: string; status: string; failedAtStep?: string | null; }
```

The participating services must already expose the action **and its inverse** over NATS (e.g. `reserve` + `release`). Those handlers must be **idempotent** (a step may be retried; a compensation may run for an action that didn't fully apply).

## 2. Context — `<saga>/<saga>.context.ts`

Everything the steps need; persisted with the saga state. Always carry `identity` (to forward downstream) and a `correlationId`.

```ts
import type { IdentityContext } from '@beta/contracts';

export interface <Saga>Context extends Record<string, unknown> {
  correlationId: string;
  identity: IdentityContext;
  // …domain ids / flags
}
```

## 3. Steps — `<saga>/steps/<step>.step.ts`

Each step extends `SagaStep`, sends a command via `NatsGatewayAdapter`, and implements `compensate` to undo it. `execute`/`name` implement abstract members (no `override`); `compensate` overrides the optional base method (**needs `override`** — `noImplicitOverride` is on).

```ts
import { SomePatterns, envelope, type SomeResponse } from '@beta/contracts';
import type { NatsGatewayAdapter } from '@beta/nats';
import { SagaStep } from '@beta/saga';
import type { <Saga>Context } from '../<saga>.context';

export class <Step>Step extends SagaStep<<Saga>Context> {
  readonly name = '<step>';
  constructor(private readonly nats: NatsGatewayAdapter) { super(); }

  async execute(ctx: <Saga>Context): Promise<void> {
    await this.nats.send<SomeResponse>(SomePatterns.Do,
      envelope(ctx.identity, { /* … */ }, { sagaId: ctx.correlationId }));
  }
  override async compensate(ctx: <Saga>Context): Promise<void> {
    await this.nats.send<SomeResponse>(SomePatterns.Undo,
      envelope(ctx.identity, { /* … */ }, { sagaId: ctx.correlationId }));
  }
}
```
A failed `execute` throws (the `NatsGatewayAdapter` surfaces a downstream error), which is what drives compensation. Only **completed** steps are compensated, in reverse.

## 4. Orchestrator — `<saga>/<saga>.orchestrator.ts`

Subclass `SagaOrchestrator`; declare the name and the ordered steps. The base class owns execution, persistence, and compensation.

```ts
import { Inject, Injectable } from '@nestjs/common';
import { NatsGatewayAdapter } from '@beta/nats';
import { SAGA_STATE_STORE, SagaOrchestrator } from '@beta/saga';
import type { SagaStateStore, SagaStep } from '@beta/saga';
import type { <Saga>Context } from './<saga>.context';
import { <Step>Step } from './steps/<step>.step';

@Injectable()
export class <Saga>Orchestrator extends SagaOrchestrator<<Saga>Context> {
  protected readonly sagaName = '<saga>';
  constructor(@Inject(SAGA_STATE_STORE) store: SagaStateStore, private readonly nats: NatsGatewayAdapter) {
    super(store);
  }
  protected steps(): SagaStep<<Saga>Context>[] {
    return [new <Step>Step(this.nats) /* , next step, … */];
  }
}
```

## 5. Controller — `<saga>/<saga>.controller.ts`

```ts
@Controller()
export class <Saga>Controller {
  constructor(private readonly orchestrator: <Saga>Orchestrator) {}

  @MessagePattern(SagaPatterns.Start<Saga>)
  async start(@Payload() env: RequestEnvelope<Start<Saga>Request>): Promise<Start<Saga>Response> {
    const ctx: <Saga>Context = { correlationId: randomUUID(), identity: env.identity, /* …from env.payload */ };
    const state = await this.orchestrator.execute(ctx);
    return { sagaId: state.id, status: state.status, failedAtStep: state.failedAtStep };
  }
}
```
A compensated saga still returns 200 with `status: "COMPENSATED"` — the failure was handled, not swallowed.

## 6. Module — `<saga>/<saga>.module.ts`

```ts
@Module({
  imports: [SagaPersistenceModule],                  // provides SAGA_STATE_STORE + registers SagaState entity
  controllers: [<Saga>Controller],
  providers: [NatsGatewayAdapter, <Saga>Orchestrator],
})
export class <Saga>Module {}
```
Import `<Saga>Module` in the orchestrator's `app.module.ts`. The orchestrator already wires `SagaState` into its `buildTypeOrmOptions` and owns `beta_saga` — no new DB needed unless you add a separate orchestrator.

## 7. Trigger it

Add a gateway endpoint that sends `SagaPatterns.Start<Saga>` (see `docs/playbooks/add-a-gateway-endpoint.md`); give it a longer timeout since a saga makes several calls.

## Verify

Run the stack, then trigger the happy path (expect `COMPLETED`, participants in their post-state) and a failing path (expect `COMPENSATED`, `failedAtStep` set, the first participant rolled back). Check `beta_saga.saga_state`:
```sh
docker compose exec -T postgres psql -U beta -d beta_saga -c \
  "select name,status,completed_steps,failed_at_step from saga_state order by created_at desc limit 5;"
```
Unit-test the orchestrator with an in-memory `SagaStateStore` + recording steps (see `libs/saga/src/lib/saga-orchestrator.spec.ts`).

## Don't

- Don't forget `override` on `compensate` (build will fail).
- Don't make steps non-idempotent — they can re-run on resume/retry.
- Don't do the cross-service write without compensation (every step that changes state needs an undo, unless it's the last/read-only one).
- Don't reach into participants' DBs to "fix" state — drive everything through their NATS commands.
