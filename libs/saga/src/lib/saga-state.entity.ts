import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@beta/persistence';
import { SagaStatus } from './saga.types';

/**
 * Durable, resumable saga state — one row per saga instance. The orchestrator
 * updates it after every step so an interrupted saga can be recovered: a FAILED
 * saga is compensated, a PENDING one continues from where it left off.
 */
@Entity('saga_state')
export class SagaState extends BaseEntity {
  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', default: SagaStatus.Pending })
  status!: SagaStatus;

  @Column({ type: 'jsonb' })
  context!: Record<string, unknown>;

  @Column({ name: 'completed_steps', type: 'jsonb', default: () => "'[]'" })
  completedSteps!: string[];

  @Column({ name: 'failed_at_step', type: 'varchar', nullable: true })
  failedAtStep!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;
}
