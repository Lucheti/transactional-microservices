/**
 * A functional Result type so domain factories and use cases can signal
 * expected, recoverable failures without throwing. Throwing is reserved for
 * truly exceptional / programmer errors.
 */
export class Result<T, E = string> {
  private constructor(
    public readonly isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {
    Object.freeze(this);
  }

  get isFailure(): boolean {
    return !this.isSuccess;
  }

  /** Unwraps the value. Throws if called on a failure (programmer error). */
  getValue(): T {
    if (!this.isSuccess) {
      throw new Error('Result.getValue() called on a failed result');
    }
    return this._value as T;
  }

  /** Unwraps the error. Throws if called on a success (programmer error). */
  getError(): E {
    if (this.isSuccess) {
      throw new Error('Result.getError() called on a successful result');
    }
    return this._error as E;
  }

  static ok<T, E = string>(value?: T): Result<T, E> {
    return new Result<T, E>(true, value);
  }

  static fail<T, E = string>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  /**
   * Returns the first failure among the given results, or a successful
   * void result if they all succeed. Handy for aggregating guard checks.
   */
  static combine(results: Result<unknown>[]): Result<void> {
    for (const result of results) {
      if (result.isFailure) {
        return Result.fail(result.getError() as string);
      }
    }
    return Result.ok();
  }
}
