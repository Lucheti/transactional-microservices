import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SagaState } from './saga-state.entity';
import { SagaStateRepository } from './saga-state.repository';
import { SAGA_STATE_STORE } from './saga-state.store';

/**
 * Registers the SagaState entity and binds the SagaStateStore port to its
 * TypeORM implementation. Import this in the app that hosts the orchestrator;
 * that app owns the saga database.
 */
@Module({
  imports: [TypeOrmModule.forFeature([SagaState])],
  providers: [
    SagaStateRepository,
    { provide: SAGA_STATE_STORE, useExisting: SagaStateRepository },
  ],
  exports: [SAGA_STATE_STORE],
})
export class SagaPersistenceModule {}
