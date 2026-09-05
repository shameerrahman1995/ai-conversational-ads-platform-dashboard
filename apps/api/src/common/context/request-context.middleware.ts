import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createLogger } from '@acp/config';
import { runWithContext } from './request-context';

const logger = createLogger({ name: 'http' });

/**
 * Wraps every request in an AsyncLocalStorage context carrying a correlation id
 * (echoed as `x-request-id`) + the resolved principal, and emits a structured
 * access log. Downstream code (audit, services) reads the context implicitly.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void): void {
    const requestId = req.headers['x-request-id'] || randomUUID();
    res.setHeader('x-request-id', requestId);
    const start = Date.now();
    runWithContext({ requestId }, () => {
      res.on('finish', () => {
        logger.info('request', {
          requestId,
          method: req.method,
          path: req.originalUrl ?? req.url,
          status: res.statusCode,
          ms: Date.now() - start,
          orgId: req.orgId,
        });
      });
      next();
    });
  }
}
