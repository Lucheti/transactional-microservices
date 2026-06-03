import { ClientProxy } from '@nestjs/microservices';
import { Observable, of, throwError } from 'rxjs';
import { NatsGatewayAdapter, NatsRequestError } from './nats-gateway.adapter';

function makeAdapter(send: () => Observable<unknown>): NatsGatewayAdapter {
  return new NatsGatewayAdapter({ send } as unknown as ClientProxy);
}

describe('NatsGatewayAdapter', () => {
  it('resolves with the response on success', async () => {
    const adapter = makeAdapter(() => of({ ok: true }));
    await expect(adapter.send('p', {})).resolves.toEqual({ ok: true });
  });

  it('preserves a downstream error status code', async () => {
    const adapter = makeAdapter(() =>
      throwError(() => ({ statusCode: 409, message: 'conflict' })),
    );
    await expect(adapter.send('p', {})).rejects.toMatchObject({
      statusCode: 409,
      message: 'conflict',
    });
  });

  it('maps a timeout to status 504', async () => {
    const adapter = makeAdapter(() => new Observable<never>(() => undefined));
    await expect(adapter.send('p', {}, 10)).rejects.toBeInstanceOf(NatsRequestError);
    await expect(adapter.send('p', {}, 10)).rejects.toMatchObject({ statusCode: 504 });
  });
});
