export const UNMATCHED_ROUTE = 'unmatched';
// Same prefix the pino autoLogging filter ignores; Docker probes it every 30s.
export const HEALTH_PATH_PREFIX = '/api/v1/health';

export interface RouteLabelRequest {
  originalUrl?: string;
  baseUrl?: string;
  route?: { path?: unknown };
}

/** Bounded-cardinality route label for HTTP metrics; null means "do not record". */
export function resolveRouteLabel(req: RouteLabelRequest): string | null {
  if (req.originalUrl?.startsWith(HEALTH_PATH_PREFIX)) return null;
  const path = req.route?.path;
  // With the global prefix Nest mounts this middleware as the `/api/*` route; it stays in req.route only when no handler matched.
  if (typeof path !== 'string' || path.endsWith('*')) return UNMATCHED_ROUTE;
  return `${req.baseUrl ?? ''}${path}`;
}
