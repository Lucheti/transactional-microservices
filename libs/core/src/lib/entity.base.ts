/**
 * Base class for domain entities. Entities have identity-based equality:
 * two entities are equal iff they are entities of the same kind and share
 * the same id, regardless of their other attribute values.
 */
export abstract class Entity<TId> {
  protected readonly _id: TId;

  protected constructor(id: TId) {
    this._id = id;
  }

  get id(): TId {
    return this._id;
  }

  equals(other?: Entity<TId>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (this === other) {
      return true;
    }
    if (!(other instanceof Entity)) {
      return false;
    }
    return this._id === other._id;
  }
}
