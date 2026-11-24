import { SUPPORTED_LOCALES } from '@guesshive/shared';
import { type BeforeSendEvent, inject, pageview } from '@vercel/analytics';

/**
 * Vercel Web Analytics (task 1.13; owner, 2026-11-20): cookieless page views only, never on
 * private pages, and never question text or ids of private content.
 *
 * Private sections: the first path segment after the locale (and after route groups such as
 * `(app)`). Every task that adds a private page (AGENTS.md §7: Dark Corner, groups, settings,
 * notifications, admin) adds its segment here, in each language it is spelled in. `auth` covers
 * sign-in links that carry tokens.
 */
export const PRIVATE_SECTIONS: ReadonlySet<string> = new Set([
  'dark-corner',
  'groups',
  'groepen',
  'settings',
  'instellingen',
  'notifications',
  'meldingen',
  'admin',
  'auth',
  'me',
]);

const LOCALES: ReadonlySet<string> = new Set(SUPPORTED_LOCALES);

/**
 * Whether a path (`/nl/groups/abc`) or route id (`/[locale]/(app)/groups/[id]`) is private.
 * Unknown or unparsable input counts as private, so it is never sent.
 */
export function isPrivatePath(pathOrRouteId: string | null | undefined): boolean {
  if (!pathOrRouteId?.startsWith('/')) {
    return true;
  }
  const segments = pathOrRouteId
    .split('/')
    .filter((segment) => segment !== '')
    .filter((segment) => !/^\(.*\)$/.test(segment));
  let first = segments[0];
  if (first !== undefined && (LOCALES.has(first) || first === '[locale]')) {
    first = segments[1];
  }
  if (first === undefined) {
    return false;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(first).toLowerCase();
  } catch {
    return true;
  }
  return PRIVATE_SECTIONS.has(decoded);
}

/**
 * Last line of defence before an event leaves the browser: drops events on private pages and
 * strips the query string and fragment (they can carry tokens, search terms or ids).
 */
export function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return null;
  }
  if (isPrivatePath(url.pathname)) {
    return null;
  }
  return { ...event, url: `${url.origin}${url.pathname}` };
}

let started = false;

/** Loads the analytics script once (browser, production builds only). */
export function startAnalytics(): void {
  if (started) {
    return;
  }
  started = true;
  // Page views are sent by trackPageview after each navigation, so they carry the route id.
  inject({ mode: 'production', disableAutoTrack: true, beforeSend });
}

/** Sends one page view, unless the page is private. Path without query string or fragment. */
export function trackPageview(routeId: string | null, pathname: string): void {
  if (!started || routeId === null || isPrivatePath(routeId) || isPrivatePath(pathname)) {
    return;
  }
  pageview({ route: routeId, path: pathname });
}
