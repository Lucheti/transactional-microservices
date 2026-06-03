/**
 * Base envelope for cross-service integration events published (fire-and-forget)
 * on NATS. Services emit these after committing a change; other services or the
 * gateway can subscribe. Kept generic so new event types are additive.
 */
export interface IntegrationEvent<TType extends string = string, TData = unknown> {
  type: TType;
  occurredAt: string; // ISO-8601 timestamp
  data: TData;
}
