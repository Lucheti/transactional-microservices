import type { IdentityContext } from './identity-context';
import { envelope } from './request-envelope';

describe('envelope', () => {
  const identity: IdentityContext = {
    userId: 'u1',
    email: 'u@example.com',
    roles: ['user'],
  };

  it('wraps identity and payload, keeping them separate', () => {
    const result = envelope(identity, { foo: 'bar' });
    expect(result.identity).toBe(identity);
    expect(result.payload).toEqual({ foo: 'bar' });
    expect(result.meta).toBeUndefined();
  });

  it('attaches meta (e.g. sagaId) when provided', () => {
    const result = envelope(identity, { foo: 'bar' }, { sagaId: 's1' });
    expect(result.meta?.sagaId).toBe('s1');
  });
});
