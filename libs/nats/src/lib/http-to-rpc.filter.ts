import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';
import type { Observable } from 'rxjs';

/**
 * The NATS transport only serializes `error.message`, so an HttpException
 * thrown inside a @MessagePattern handler would lose its status code on the
 * wire. This filter rewraps any HttpException as an RpcException carrying the
 * full { statusCode, message, error } payload, which the gateway's
 * RpcToHttpFilter then translates back into the correct HTTP status.
 *
 * Apply on every internal microservice: `app.useGlobalFilters(new HttpToRpcExceptionFilter())`.
 */
@Catch(HttpException)
export class HttpToRpcExceptionFilter extends BaseRpcExceptionFilter {
  override catch(exception: HttpException, host: ArgumentsHost): Observable<unknown> {
    const status = exception.getStatus();
    const res = exception.getResponse();
    const payload =
      typeof res === 'string'
        ? { statusCode: status, message: res }
        : { statusCode: status, ...(res as Record<string, unknown>) };
    return super.catch(new RpcException(payload), host);
  }
}
