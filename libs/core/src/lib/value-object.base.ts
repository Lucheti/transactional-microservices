/**
 * Base class for value objects: immutable and compared by structural value
 * rather than identity. Subclasses pass their props to the constructor and
 * expose intention-revealing getters over `props`.
 */
export abstract class ValueObject<TProps extends object> {
  protected readonly props: Readonly<TProps>;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  equals(other?: ValueObject<TProps>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (!(other instanceof ValueObject)) {
      return false;
    }
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
