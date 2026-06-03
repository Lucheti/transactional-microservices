import { Result } from './result';

describe('Result', () => {
  it('wraps a success value', () => {
    const r = Result.ok<number>(42);
    expect(r.isSuccess).toBe(true);
    expect(r.isFailure).toBe(false);
    expect(r.getValue()).toBe(42);
  });

  it('wraps a failure error', () => {
    const r = Result.fail<number>('boom');
    expect(r.isFailure).toBe(true);
    expect(r.getError()).toBe('boom');
  });

  it('throws when reading the value of a failure', () => {
    expect(() => Result.fail<number>('boom').getValue()).toThrow();
  });

  it('combine returns the first failure', () => {
    const combined = Result.combine([
      Result.ok(),
      Result.fail('second failed'),
      Result.ok(),
    ]);
    expect(combined.isFailure).toBe(true);
    expect(combined.getError()).toBe('second failed');
  });

  it('combine succeeds when all succeed', () => {
    expect(Result.combine([Result.ok(), Result.ok()]).isSuccess).toBe(true);
  });
});
