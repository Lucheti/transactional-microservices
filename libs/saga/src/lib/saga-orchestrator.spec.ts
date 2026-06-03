import { SagaOrchestrator } from './saga-orchestrator';
import { SagaState } from './saga-state.entity';
import { SagaStep } from './saga-step';
import type { SagaStateStore } from './saga-state.store';
import { SagaStatus } from './saga.types';

type Ctx = Record<string, unknown>;

/** In-memory SagaStateStore so the orchestrator can be tested without a DB. */
class InMemorySagaStateStore implements SagaStateStore {
  async start(name: string, context: Ctx): Promise<SagaState> {
    const state = new SagaState();
    state.id = 'saga-1';
    state.name = name;
    state.status = SagaStatus.Pending;
    state.context = context;
    state.completedSteps = [];
    state.failedAtStep = null;
    state.error = null;
    return state;
  }
  async markStepCompleted(state: SagaState, stepName: string): Promise<SagaState> {
    state.completedSteps = [...state.completedSteps, stepName];
    return state;
  }
  async markCompleted(state: SagaState): Promise<SagaState> {
    state.status = SagaStatus.Completed;
    return state;
  }
  async markFailed(state: SagaState, stepName: string, error: string): Promise<SagaState> {
    state.status = SagaStatus.Failed;
    state.failedAtStep = stepName;
    state.error = error;
    return state;
  }
  async markCompensated(state: SagaState): Promise<SagaState> {
    state.status = SagaStatus.Compensated;
    return state;
  }
  async findById(): Promise<SagaState | null> {
    return null;
  }
}

class RecordingStep extends SagaStep<Ctx> {
  constructor(
    public readonly name: string,
    private readonly log: string[],
    private readonly shouldFail = false,
  ) {
    super();
  }
  async execute(): Promise<void> {
    this.log.push(`exec:${this.name}`);
    if (this.shouldFail) {
      throw new Error(`${this.name} failed`);
    }
  }
  override async compensate(): Promise<void> {
    this.log.push(`comp:${this.name}`);
  }
}

class TestSaga extends SagaOrchestrator<Ctx> {
  protected readonly sagaName = 'test-saga';
  constructor(store: SagaStateStore, private readonly _steps: SagaStep<Ctx>[]) {
    super(store);
  }
  protected steps(): SagaStep<Ctx>[] {
    return this._steps;
  }
}

describe('SagaOrchestrator', () => {
  it('runs every step in order and completes on the happy path', async () => {
    const log: string[] = [];
    const saga = new TestSaga(new InMemorySagaStateStore(), [
      new RecordingStep('s1', log),
      new RecordingStep('s2', log),
    ]);

    const state = await saga.execute({});

    expect(state.status).toBe(SagaStatus.Completed);
    expect(state.completedSteps).toEqual(['s1', 's2']);
    expect(log).toEqual(['exec:s1', 'exec:s2']);
  });

  it('compensates completed steps in reverse order when a step fails', async () => {
    const log: string[] = [];
    const saga = new TestSaga(new InMemorySagaStateStore(), [
      new RecordingStep('s1', log),
      new RecordingStep('s2', log, true), // fails
      new RecordingStep('s3', log),
    ]);

    const state = await saga.execute({});

    expect(state.status).toBe(SagaStatus.Compensated);
    expect(state.failedAtStep).toBe('s2');
    expect(state.completedSteps).toEqual(['s1']);
    // s1 ran, s2 ran+threw (never completed → not compensated), s3 never ran,
    // then s1 is compensated.
    expect(log).toEqual(['exec:s1', 'exec:s2', 'comp:s1']);
  });
});
