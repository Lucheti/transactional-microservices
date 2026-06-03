import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, firstValueFrom, throwError, timeout, TimeoutError } from 'rxjs';
import { NATS_CLIENT } from './nats-tokens';

/**
 * Error carrying an HTTP-mappable status, thrown when a NATS request fails or
 * times out. The gateway's RpcToHttpFilter reads `statusCode`; the orchestrator
 * just treats it as a failed step (and compensates).
 */
export class NatsRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NatsRequestError';
  }
}

/**
 * Reusable wrapper over ClientProxy.send for callers that initiate NATS
 * requests (the gateway and the orchestrator). Applies a consistent timeout
 * and normalizes failures: a timeout → 504, a serialized downstream error keeps
 * its status code, anything else → 500. Promotes alpha's ad-hoc per-call
 * `.pipe(timeout())` into one place.
 */
@Injectable()
export class NatsGatewayAdapter {
  private readonly defaultTimeoutMs: number;

  constructor(@Inject(NATS_CLIENT) private readonly client: ClientProxy) {
    this.defaultTimeoutMs = Number(process.env['NATS_REQUEST_TIMEOUT_MS'] ?? '5000');
  }

  async send<TResponse, TRequest = unknown>(
    pattern: string,
    payload: TRequest,
    timeoutMs: number = this.defaultTimeoutMs,
  ): Promise<TResponse> {
    return firstValueFrom(
      this.client.send<TResponse, TRequest>(pattern, payload).pipe(
        timeout(timeoutMs),
        catchError((err: unknown) => throwError(() => this.normalize(pattern, err))),
      ),
    );
  }

  emit<TPayload>(pattern: string, payload: TPayload): void {
    this.client.emit(pattern, payload);
  }

  private normalize(pattern: string, err: unknown): NatsRequestError {
    if (err instanceof TimeoutError) {
      return new NatsRequestError(`timeout calling ${pattern}`, 504, err);
    }
    const e = err as { statusCode?: number; status?: number; message?: string };
    const status = e?.statusCode ?? e?.status;
    return new NatsRequestError(
      e?.message ?? 'internal error',
      typeof status === 'number' ? status : 500,
      err,
    );
  }
}
