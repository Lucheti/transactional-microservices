/**
 * Marker contract for domain events raised by an aggregate root. Concrete
 * events carry whatever payload the domain needs plus when they occurred.
 */
export interface DomainEvent {
  readonly occurredAt: Date;
}
