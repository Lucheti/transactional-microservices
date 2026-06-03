# Playbook: publish & consume an integration event

Use an **event** when a service wants to announce that something happened and zero-or-more other services react — the producer doesn't know or care who listens, and doesn't wait for a reply. Use a **command** (see `add-a-gateway-endpoint.md` / `add-a-cached-entity.md`) when you need a specific service to do something and return a result.

| | Command | Event |
|---|---|---|
| Send | `client.send(pattern, env)` (via `NatsGatewayAdapter`) | `client.emit(subject, event)` |
| Handle | `@MessagePattern` (returns a response) | `@EventPattern` (returns `void`) |
| Payload | `RequestEnvelope<T>` (carries identity) | the `IntegrationEvent` (a fact; no identity envelope) |
| Shape | request/response, 1:1 | fire-and-forget, 1:many |

The foundation ships the generic `IntegrationEvent` base in `@beta/contracts`; there's no example publisher or consumer yet. This playbook builds both sides. Running illustration: a `<thing>` service emits a "created" event and a separate consumer (say an `audit` service) reacts.

---

## Part A — publish a new event

### 1. Define it in `@beta/contracts`

`events/<thing>.events.ts`:
```ts
import type { IntegrationEvent } from './integration-event';

export const <Thing>EventSubjects = { Created: 'event.<thing>.created' } as const;

export type <Thing>CreatedEvent = IntegrationEvent<
  '<thing>.created',
  { <thing>Id: string; /* …only the facts a consumer needs */ }
>;
```
Export from `libs/contracts/src/index.ts`. Events are part of the shared wire vocabulary — they live in contracts, like patterns and DTOs.

### 2. Emit it from the producer, after the write commits

Give the producing service an event-publisher port + a NATS adapter (template):
- `application/event-publisher.port.ts`:
  ```ts
  import type { IntegrationEvent } from '@beta/contracts';
  export interface EventPublisherPort { publish(subject: string, event: IntegrationEvent): void; }
  export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
  ```
- `infrastructure/nats-event.publisher.ts`: `@Injectable() NatsEventPublisher implements EventPublisherPort`, inject `@Inject(NATS_CLIENT)`, `publish(subject, event) { this.client.emit(subject, event); }`.
- Bind `{ provide: EVENT_PUBLISHER, useClass: NatsEventPublisher }` in the feature module.

Then in the use case, **after** the repository `save` succeeds:
```ts
const saved = await this.things.save(thing);
this.events.publish(<Thing>EventSubjects.Created, {
  type: '<thing>.created',
  occurredAt: new Date().toISOString(),
  data: { <thing>Id: saved.id },
});
return saved;
```
Emit after commit so you never announce a change that failed to persist. If a consumer needs to know *who* did it, put that in `data` explicitly — events don't carry the identity envelope.

---

## Part B — consume an event (build a subscriber)

A consumer is a normal internal service (see `add-a-service.md`) — call it `<consumer>` (e.g. `audit`).

### 1. `main.ts` — the standard microservice bootstrap

`NestFactory.createMicroservice(AppModule, { transport: Transport.NATS, options: { servers, queue: '<consumer>' } })` + `HttpToRpcExceptionFilter`. The **queue group** means each event is handled by exactly one `<consumer>` instance (process-once). Omit the queue only if every instance must see every event (fanout).

### 2. An `@EventPattern` controller

```ts
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { <Thing>CreatedEvent, <Thing>EventSubjects } from '@beta/contracts';
import { Record<Thing>UseCase } from '../application/record-<thing>.usecase';

@Controller()
export class <Consumer>EventsController {
  constructor(private readonly record: Record<Thing>UseCase) {}

  @EventPattern(<Thing>EventSubjects.Created)
  async on<Thing>Created(@Payload() event: <Thing>CreatedEvent): Promise<void> {
    await this.record.execute(event.data);
  }
}
```
`@EventPattern` handlers receive the raw `IntegrationEvent` (no envelope) and return `void`. Keep them idempotent — an event can be redelivered.

### 3. Persist or act

Delegate to a use case backed by a repository port (the usual layering). For an **append-only log**, a plain TypeORM-backed repository is appropriate — not everything needs caching, so this repo can skip `CachedRepository` (just implement the port over `Repository<…OrmEntity>`). For cacheable read models, follow `add-a-cached-entity.md`. Wire the service's DB per `add-a-service.md` (its own `<CONSUMER>_DB_NAME` / `beta_<consumer>`, added to `init.sql` + compose).

---

## Delivery semantics (know the trade-off)

`Transport.NATS` core pub/sub is **at-most-once**: emit is fire-and-forget; if no subscriber is connected, the event is dropped (no persistence, no replay). That's fine for best-effort fan-out. For **at-least-once with durability/replay**, use NATS **JetStream** (the compose `nats` already runs with `-js`) — that's a larger change (JetStream streams + durable consumers, different client config) and is out of scope for this playbook. Don't put money-movement or must-not-lose flows on best-effort events; use a saga (`add-a-saga.md`) or JetStream.

## Verify

Bring up the stack + the consumer, trigger the producer (so it emits), and confirm the consumer reacted:
```sh
docker compose logs -f <consumer>     # should log the <thing>.created event
# or, if it persists:
docker compose exec -T postgres psql -U beta -d beta_<consumer> -c "select * from <table> order by created_at desc limit 5;"
```

## Don't

- Don't use an event for request/response — that's a command (`@MessagePattern`).
- Don't expect `RequestEnvelope`/identity in an event handler — events carry the `IntegrationEvent`; include any needed actor info in `data`.
- Don't emit before the state change commits.
- Don't rely on core-NATS events for critical, must-not-lose delivery without JetStream.
