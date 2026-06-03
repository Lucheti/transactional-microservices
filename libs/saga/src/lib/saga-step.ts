/**
 * One step in a saga.
 *  - `execute` performs the forward action (typically an RPC to a service).
 *  - `compensate` (optional) semantically undoes a completed step when a later
 *    step fails.
 *
 * Steps must be idempotent: a crashed saga may re-run a step on resume, and a
 * compensation may be retried, so both must be safe to apply more than once.
 */
export abstract class SagaStep<TContext> {
  abstract readonly name: string;
  abstract execute(context: TContext): Promise<void>;
  compensate?(context: TContext): Promise<void>;
}
