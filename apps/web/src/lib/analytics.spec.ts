import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { inject, pageview } = vi.hoisted(() => ({ inject: vi.fn(), pageview: vi.fn() }));
vi.mock('@vercel/analytics', () => ({ inject, pageview }));

const {
  beforeSend,
  pageviewPath,
  PUBLIC_ROUTES,
  resetAnalyticsForTests,
  setAnalyticsConsent,
  startAnalytics,
  trackPageview,
} = await import('./analytics.js');

const ORIGIN = 'https://guesshive.com';

describe('pageviewPath (task 1.13)', () => {
  it('tracks only allow-listed routes, with their real path', () => {
    expect(pageviewPath('/', '/', undefined)).toBe('/');
    expect(pageviewPath('/[locale]', '/nl', {})).toBe('/nl');
  });

  it.each([
    ['an unknown route (404)', null, '/nl/whatever'],
    ['a route nobody allow-listed', '/[locale]/groups/[id]', '/nl/groups/abc'],
    ['a dark corner route', '/[locale]/dark-corner', '/nl/dark-corner'],
    ['a matcher form of the locale', '/[locale=locale]', '/nl'],
    ['an optional locale', '/[[locale]]', '/nl'],
    ['the api proxy', '/api/[...path]', '/api/me'],
  ])('never tracks %s', (_, routeId, pathname) => {
    expect(pageviewPath(routeId, pathname, undefined)).toBeUndefined();
  });

  it('respects a page opting out through its load data', () => {
    expect(pageviewPath('/[locale]', '/nl', { analytics: false })).toBeUndefined();
    expect(pageviewPath('/[locale]', '/nl', { analytics: true })).toBe('/nl');
  });

  it('only allow-lists routes in path mode when their params carry no personal data', () => {
    for (const [routeId, mode] of PUBLIC_ROUTES) {
      if (mode === 'path') {
        expect(routeId.replace('[locale]', '')).not.toMatch(/\[/);
      }
    }
  });
});

describe('trackPageview and beforeSend', () => {
  beforeEach(() => {
    resetAnalyticsForTests();
    setAnalyticsConsent(true);
    inject.mockClear();
    pageview.mockClear();
  });

  afterEach(() => {
    resetAnalyticsForTests();
  });

  it('loads nothing and sends nothing without consent', () => {
    setAnalyticsConsent(false);
    startAnalytics();
    trackPageview('/[locale]', '/nl', undefined);
    expect(inject).not.toHaveBeenCalled();
    expect(pageview).not.toHaveBeenCalled();
  });

  it('stops sending page views once consent is withdrawn', () => {
    startAnalytics();
    setAnalyticsConsent(false);
    trackPageview('/[locale]', '/nl', undefined);
    expect(pageview).not.toHaveBeenCalled();
  });

  it('injects the script once, without automatic tracking', () => {
    startAnalytics();
    startAnalytics();
    expect(inject).toHaveBeenCalledTimes(1);
    expect(inject).toHaveBeenCalledWith({
      mode: 'production',
      disableAutoTrack: true,
      beforeSend,
    });
  });

  it('sends nothing before the script is started', () => {
    trackPageview('/[locale]', '/nl', undefined);
    expect(pageview).not.toHaveBeenCalled();
  });

  it('sends allow-listed page views and lets exactly those through beforeSend', () => {
    startAnalytics();
    trackPageview('/[locale]', '/nl', undefined);
    expect(pageview).toHaveBeenCalledWith({ route: '/[locale]', path: '/nl' });
    expect(beforeSend({ type: 'pageview', url: `${ORIGIN}/nl?token=secret#x` })).toEqual({
      type: 'pageview',
      url: `${ORIGIN}/nl`,
    });
    // Consumed: a second, unexpected page view for the same path is dropped.
    expect(beforeSend({ type: 'pageview', url: `${ORIGIN}/nl` })).toBeNull();
  });

  it('does not send private or unknown pages, and drops what the script sends on its own', () => {
    startAnalytics();
    trackPageview('/[locale]/groups/[id]', '/nl/groups/abc', undefined);
    trackPageview(null, '/nl/x', undefined);
    trackPageview('/[locale]', '/nl', { analytics: false });
    expect(pageview).not.toHaveBeenCalled();
    expect(beforeSend({ type: 'pageview', url: `${ORIGIN}/nl/groups/abc` })).toBeNull();
    expect(beforeSend({ type: 'event', url: `${ORIGIN}/nl` })).toBeNull();
    expect(beforeSend({ type: 'pageview', url: 'not a url' })).toBeNull();
  });

  it('matches queued page views in any order', () => {
    startAnalytics();
    trackPageview('/', '/', undefined);
    trackPageview('/[locale]', '/en', undefined);
    expect(beforeSend({ type: 'pageview', url: `${ORIGIN}/en` })).toEqual({
      type: 'pageview',
      url: `${ORIGIN}/en`,
    });
    expect(beforeSend({ type: 'pageview', url: `${ORIGIN}/` })).toEqual({
      type: 'pageview',
      url: `${ORIGIN}/`,
    });
  });
});
