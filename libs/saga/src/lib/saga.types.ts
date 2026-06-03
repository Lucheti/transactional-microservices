/** Lifecycle of a saga instance. */
export enum SagaStatus {
  Pending = 'PENDING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
  Compensated = 'COMPENSATED',
}
