import { IncomingMessage, ServerResponse } from 'http';
import { resolveRequestId } from './request-id.helper';

function reqRes(headers: Record<string, string> = {}) {
  const req = { headers } as unknown as IncomingMessage;
  const res = { setHeader: jest.fn() } as unknown as ServerResponse;
  return { req, res };
}

describe('resolveRequestId', () => {
  it('reuses a safe incoming X-Request-Id and echoes it back', () => {
    const { req, res } = reqRes({ 'x-request-id': 'abc-123_DEF' });

    expect(resolveRequestId(req, res)).toBe('abc-123_DEF');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'abc-123_DEF');
  });

  it('generates a UUID when the header is absent', () => {
    const { req, res } = reqRes();

    const id = resolveRequestId(req, res);

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', id);
  });

  it('replaces an unsafe or oversized client value instead of logging it', () => {
    const injected = reqRes({ 'x-request-id': 'x\n{"level":"fatal"}' });
    const oversized = reqRes({ 'x-request-id': 'a'.repeat(129) });

    expect(resolveRequestId(injected.req, injected.res)).not.toContain('\n');
    expect(resolveRequestId(oversized.req, oversized.res)).toHaveLength(36);
  });
});
