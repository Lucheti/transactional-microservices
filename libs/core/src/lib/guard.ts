import { Result } from './result';

/**
 * Small, composable argument guards used by domain factories to validate
 * invariants before an aggregate is constructed. Each guard returns a
 * Result so callers can aggregate them with Guard.combine().
 */
export class Guard {
  static againstNullOrUndefined(value: unknown, argumentName: string): Result<void> {
    if (value === null || value === undefined) {
      return Result.fail(`${argumentName} is null or undefined`);
    }
    return Result.ok();
  }

  static againstEmpty(
    value: string | null | undefined,
    argumentName: string,
  ): Result<void> {
    if (value === null || value === undefined || value.trim().length === 0) {
      return Result.fail(`${argumentName} must not be empty`);
    }
    return Result.ok();
  }

  static combine(guards: Result<void>[]): Result<void> {
    return Result.combine(guards);
  }
}
