import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import { createLogger } from '@acp/config';
import { getContext } from '../context/request-context';

const logger = createLogger({ name: 'api-error' });

/**
 * Global exception filter: logs unhandled errors (with correlation id, redacted)
 * and returns a stable JSON shape. Prevents raw 500 leakage of internals.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();
    const req = host.switchToHttp().getRequest();
    const requestId = getContext()?.requestId;

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttp ? exception.getResponse() : undefined;

    if (status >= 500) {
      logger.error('unhandled_exception', {
        requestId,
        path: req?.originalUrl ?? req?.url,
        status,
        error: exception instanceof Error ? exception.name : 'Unknown',
        message: exception instanceof Error ? exception.message : String(exception),
      });
    }

    const payload =
      typeof body === 'object' && body !== null
        ? body
        : {
            statusCode: status,
            message: isHttp ? String(body) : 'Internal server error',
            error: HttpStatus[status] ?? 'Error',
          };

    res.status(status).json({ ...payload, requestId });
  }
}
