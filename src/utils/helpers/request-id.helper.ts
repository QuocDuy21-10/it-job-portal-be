import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';

// The header is client-controlled: only reuse values that cannot break a JSON log line.
const SAFE_REQUEST_ID = /^[\w-]{1,128}$/;

/** Reuses the proxy's X-Request-Id when safe, otherwise generates one, and echoes it to the client. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}
