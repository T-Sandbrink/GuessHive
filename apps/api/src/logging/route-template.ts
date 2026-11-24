import type { IncomingMessage } from 'node:http';

/** Where the matched route template is stored on the request for the log line. */
const ROUTE_TEMPLATE = Symbol('routeTemplate');

interface RoutedRequest extends IncomingMessage {
  route?: { path?: unknown };
  [ROUTE_TEMPLATE]?: string;
}

/**
 * Records the matched route template (`/questions/:id`) on the request. Called while the
 * Nest handler runs (interceptor, exception filter), because when pino-http logs at
 * response end, Express 5 reports its own wildcard middleware route instead.
 */
export function rememberRouteTemplate(req: IncomingMessage): void {
  const routed = req as RoutedRequest;
  const path = routed.route?.path;
  // Wildcard paths are catch-alls (Nest's own not-found route), not a matched endpoint.
  // A real wildcard endpoint added later would also log as `unmatched`; revisit then.
  if (typeof path === 'string' && !path.includes('*')) {
    routed[ROUTE_TEMPLATE] = path;
  }
}

/**
 * The route template for the log line, never the raw URL: query strings and path
 * parameters can hold tokens or personal data (AGENTS.md §8).
 */
export function routeTemplate(req: IncomingMessage): string {
  return (req as RoutedRequest)[ROUTE_TEMPLATE] ?? 'unmatched';
}
