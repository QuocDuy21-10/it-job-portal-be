import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';
import { resolveRouteLabel } from './route-label';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const end = this.metrics.httpRequestDuration.startTimer();
    // req.route is only set once Express has matched a route, so read it at finish.
    res.on('finish', () => {
      const route = resolveRouteLabel(req);
      if (route !== null) end({ method: req.method, route, status_code: String(res.statusCode) });
    });
    next();
  }
}
