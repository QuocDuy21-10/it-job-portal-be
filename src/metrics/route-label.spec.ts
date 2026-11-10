import { resolveRouteLabel, UNMATCHED_ROUTE } from './route-label';

describe('resolveRouteLabel', () => {
  it('uses the matched Express route pattern, not the raw URL', () => {
    expect(
      resolveRouteLabel({
        originalUrl: '/api/v1/jobs/abc?x=1',
        baseUrl: '',
        route: { path: '/api/v1/jobs/:id' },
      }),
    ).toBe('/api/v1/jobs/:id');
  });

  it('prefixes the router base url when there is one', () => {
    expect(
      resolveRouteLabel({ originalUrl: '/admin/x', baseUrl: '/admin', route: { path: '/:id' } }),
    ).toBe('/admin/:id');
  });

  it('labels requests that matched no route as unmatched', () => {
    expect(resolveRouteLabel({ originalUrl: '/api/v1/nope', baseUrl: '' })).toBe(UNMATCHED_ROUTE);
  });

  it('labels the middleware wildcard route as unmatched', () => {
    expect(
      resolveRouteLabel({ originalUrl: '/api/v1/nope', baseUrl: '', route: { path: '/api/*' } }),
    ).toBe(UNMATCHED_ROUTE);
  });

  it('skips health probes', () => {
    expect(
      resolveRouteLabel({
        originalUrl: '/api/v1/health/live',
        baseUrl: '',
        route: { path: '/api/v1/health/live' },
      }),
    ).toBeNull();
    expect(resolveRouteLabel({ originalUrl: '/api/v1/health', baseUrl: '' })).toBeNull();
  });
});
