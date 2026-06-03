import type { SagaState } from './saga-state.entity';
import type { SagaStateStore } from './saga-state.store';
import { SagaStep } from './saga-step';
import { SagaStatus } from './saga.types';

/**
 * Abstract orchestrator implementing the saga pattern with compensation.
 *
 * Subclasses declare an ordered list of steps via `steps()` and a `sagaName`.
 * `execute` runs the steps forward, persisting progress after each. If a step
 * throws, the saga is marked FAILED and the already-completed steps are
 * compensated in reverse order, ending COMPENSATED. Because state is durable,
 * an interrupted saga can be recovered with `resume`.
 *
 * This is true orchestration (a central coordinator issuing commands), as
 * opposed to choreography (services reacting to each other's events).
 */
export abstract class SagaOrchestrator<TContext extends Record<string, unknown>> {
  protected abstract readonly sagaName: string;
  protected abstract steps(): SagaStep<TContext>[];

  protected constructor(protected readonly store: SagaStateStore) {}

  async execute(context: TContext): Promise<SagaState> {
    let state = await this.store.start(this.sagaName, context);
    const steps = this.steps();

    for (const step of steps) {
      try {
        await step.execute(context);
        state = await this.store.markStepCompleted(state, step.name);
      } catch (err) {
        state = await this.store.markFailed(state, step.name, (err as Error).message);
        return this.compensate(state, context, steps);
      }
    }

    return this.store.markCompleted(state);
  }

  /**
   * Resume a persisted saga: a FAILED saga is compensated; a PENDING saga
   * continues from its first not-yet-completed step. COMPLETED/COMPENSATED
   * sagas are returned unchanged (idempotent).
   */
  async resume(sagaId: string): Promise<SagaState | null> {
    const state = await this.store.findById(sagaId);
    if (!state) {
      return null;
    }
    const steps = this.steps();
    const context = state.context as TContext;

    if (state.status === SagaStatus.Failed) {
      return this.compensate(state, context, steps);
    }
    if (state.status !== SagaStatus.Pending) {
      return state;
    }

    const completed = new Set(state.completedSteps);
    let current = state;
    for (const step of steps) {
      if (completed.has(step.name)) {
        continue;
      }
      try {
        await step.execute(context);
        current = await this.store.markStepCompleted(current, step.name);
      } catch (err) {
        current = await this.store.markFailed(current, step.name, (err as Error).message);
        return this.compensate(current, context, steps);
      }
    }
    return this.store.markCompleted(current);
  }

  /** Compensate the completed steps in reverse order, best-effort. */
  protected async compensate(
    state: SagaState,
    context: TContext,
    steps: SagaStep<TContext>[],
  ): Promise<SagaState> {
    const completed = new Set(state.completedSteps);
    const toUndo = [...steps].reverse().filter((step) => completed.has(step.name));

    for (const step of toUndo) {
      if (!step.compensate) {
        continue;
      }
      try {
        await step.compensate(context);
      } catch {
        // Keep unwinding the rest even if one compensation fails; the failure
        // is recoverable on a later resume(). (A real system would log/alert.)
      }
    }
    return this.store.markCompensated(state);
  }
}
