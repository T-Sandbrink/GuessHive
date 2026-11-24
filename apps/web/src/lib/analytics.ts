import { type BeforeSendEvent, inject, pageview } from '@vercel/analytics';

/**
 * Vercel Web Analytics (task 1.13; owner, 2026-11-20): cookieless page views only, never on
 * private pages, never question text or ids of private content, never personal data.
 *
 * Fail-closed by design:
 * - Only routes listed in PUBLIC_ROUTES are ever tracked. A new page is not tracked until its
 *   task adds it here, deliberately.
 * - A page can still opt out through its load data (`analytics: false`), e.g. a question page
 *   showing a Dark Corner or group question.
 * - `beforeSend` lets through only the page view this module itself just sent, rewritten to the
 *   path decided here (no query string or fragment). Everything else the script would send
 *   (automatic page views, custom events) is dropped.
 */

/** How a tracked route reports its path. */
type PathMode =
  /** The real path, e.g. `/nl`. Only for routes whose params carry no personal data. */
  | 'path'
  /** The route id instead of the path, e.g. `/[locale]/u/[username]`: which page, not whose. */
  | 'route';

/** Route id → path mode. Every task that adds a public page decides here whether it is tracked. */
export const PUBLIC_ROUTES: ReadonlyMap<string, PathMode> = new Map<string, PathMode>([
  ['/', 'path'],
  ['/[locale]', 'path'],
]);

/** What a page's load data may set to keep a page view from being sent. */
export interface AnalyticsPageData {
  analytics?: boolean;
}

/**
 * Page views this module sent and the script has not processed yet (calls made before the script
 * loads are queued). `beforeSend` only lets these through. Bounded, oldest dropped first.
 */
const pending: { pathname: string; sendAs: string }[] = [];
const MAX_PENDING = 20;
let started = false;

/** Whether a page view for this route and page data may be sent, and with which path. */
export function pageviewPath(
  routeId: string | null,
  pathname: string,
  data: AnalyticsPageData | undefined,
): string | undefined {
  if (routeId === null || data?.analytics === false) {
    return undefined;
  }
  const mode = PUBLIC_ROUTES.get(routeId);
  if (mode === undefined) {
    return undefined;
  }
  return mode === 'path' ? pathname : routeId;
}

/**
 * Last line of defence before an event leaves the browser: only the page view sent by
 * `trackPageview` passes, with its URL reduced to origin + the decided path.
 */
export function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== 'pageview') {
    return null;
  }
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return null;
  }
  // The script may report the real location or the path we passed; accept either form.
  const index = pending.findIndex(
    (entry) =>
      url.pathname === entry.pathname ||
      url.pathname === new URL(entry.sendAs, url.origin).pathname,
  );
  if (index === -1) {
    return null;
  }
  const [expected] = pending.splice(index, 1);
  return expected ? { ...event, url: `${url.origin}${expected.sendAs}` } : null;
}

/** Loads the analytics script once. Call only in the browser, when analytics is enabled. */
export function startAnalytics(): void {
  if (started) {
    return;
  }
  started = true;
  // Page views are sent by trackPageview after each navigation; nothing is tracked automatically.
  inject({ mode: 'production', disableAutoTrack: true, beforeSend });
}

/**
 * Sends one page view for a navigation, if the route is public and the page did not opt out.
 * Unknown routes (404s, `routeId === null`) are never tracked.
 */
export function trackPageview(
  routeId: string | null,
  pathname: string,
  data: AnalyticsPageData | undefined,
): void {
  if (!started) {
    return;
  }
  const sendAs = pageviewPath(routeId, pathname, data);
  if (sendAs === undefined || routeId === null) {
    return;
  }
  pending.push({ pathname, sendAs });
  if (pending.length > MAX_PENDING) {
    pending.shift();
  }
  pageview({ route: routeId, path: sendAs });
}

/** Test helper: forget module state between tests. */
export function resetAnalyticsForTests(): void {
  pending.length = 0;
  started = false;
}
