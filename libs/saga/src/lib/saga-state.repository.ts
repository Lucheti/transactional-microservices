import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SagaState } from './saga-state.entity';
import type { SagaStateStore } from './saga-state.store';
import { SagaStatus } from './saga.types';

/** TypeORM-backed SagaStateStore. Lives wherever the orchestrator runs and
 *  owns its own database (database-per-service). */
@Injectable()
export class SagaStateRepository implements SagaStateStore {
  constructor(
    @InjectRepository(SagaState)
    private readonly repo: Repository<SagaState>,
  ) {}

  start(name: string, context: Record<string, unknown>): Promise<SagaState> {
    const state = this.repo.create({
      name,
      status: SagaStatus.Pending,
      context,
      completedSteps: [],
      failedAtStep: null,
      error: null,
    });
    return this.repo.save(state);
  }

  markStepCompleted(state: SagaState, stepName: string): Promise<SagaState> {
    state.completedSteps = [...state.completedSteps, stepName];
    return this.repo.save(state);
  }

  markCompleted(state: SagaState): Promise<SagaState> {
    state.status = SagaStatus.Completed;
    return this.repo.save(state);
  }

  markFailed(state: SagaState, stepName: string, error: string): Promise<SagaState> {
    state.status = SagaStatus.Failed;
    state.failedAtStep = stepName;
    state.error = error;
    return this.repo.save(state);
  }

  markCompensated(state: SagaState): Promise<SagaState> {
    state.status = SagaStatus.Compensated;
    return this.repo.save(state);
  }

  findById(id: string): Promise<SagaState | null> {
    return this.repo.findOne({ where: { id } });
  }
}
