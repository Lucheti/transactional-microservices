import type { SagaState } from './saga-state.entity';

/**
 * Persistence port for saga state. The orchestrator depends on this interface,
 * not on TypeORM, so its logic is unit-testable with an in-memory fake.
 */
export interface SagaStateStore {
  start(name: string, context: Record<string, unknown>): Promise<SagaState>;
  markStepCompleted(state: SagaState, stepName: string): Promise<SagaState>;
  markCompleted(state: SagaState): Promise<SagaState>;
  markFailed(state: SagaState, stepName: string, error: string): Promise<SagaState>;
  markCompensated(state: SagaState): Promise<SagaState>;
  findById(id: string): Promise<SagaState | null>;
}

export const SAGA_STATE_STORE = Symbol('SAGA_STATE_STORE');
