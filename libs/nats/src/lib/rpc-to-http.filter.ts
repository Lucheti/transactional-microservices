import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

interface SerializedHttpError {
  statusCode?: number;
  status?: number;
  message?: string | string[];
  error?: string;
}

/**
 * Gateway-side filter: turns errors bubbling up from NATS calls back into HTTP
 * responses. A downstream HttpException arrives as a serialized
 * { statusCode, message, error } object (see HttpToRpcExceptionFilter); this
 * maps it to the right status. Anything unrecognized becomes a 500.
 */
@Catch()
export class RpcToHttpFilter implements ExceptionFilter {
  private readonly logger = new Logger(RpcToHttpFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }

    if (error && typeof error === 'object') {
      const payload = error as SerializedHttpError;
      const status = payload.statusCode ?? payload.status;
      if (typeof status === 'number') {
        response.status(status).json({
          statusCode: status,
          message: payload.message ?? 'request failed',
          error: payload.error,
        });
        return;
      }
    }

    this.logger.error('unhandled gateway error', error as Error);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'internal server error',
    });
  }
}
