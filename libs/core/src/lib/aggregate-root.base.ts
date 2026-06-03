import { DomainEvent } from './domain-event';
import { Entity } from './entity.base';

/**
 * An aggregate root is the consistency boundary around a cluster of domain
 * objects. It records domain events as state changes happen; the application
 * layer pulls and publishes them after the aggregate has been persisted
 * (so we never publish an event for a change that failed to commit).
 */
export abstract class AggregateRoot<TId> extends Entity<TId> {
  private _domainEvents: DomainEvent[] = [];

  get domainEvents(): readonly DomainEvent[] {
    return this._domainEvents;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  /** Returns and clears the pending domain events. */
  pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }
}
