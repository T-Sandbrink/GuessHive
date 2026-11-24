import { describe, expect, it } from 'vitest';
import { beforeSend, isPrivatePath } from './analytics.js';

describe('isPrivatePath (task 1.13)', () => {
  it.each([
    '/nl/groups/k3x9ma',
    '/en/groups',
    '/nl/groepen/k3x9ma',
    '/en/settings/privacy',
    '/nl/instellingen',
    '/en/notifications',
    '/nl/meldingen',
    '/en/admin/settings',
    '/nl/dark-corner/q/abc',
    '/en/auth/reset-password',
    '/en/me',
    '/[locale]/(app)/groups/[id]',
    '/[locale]/admin',
    '/(app)/settings',
    '/en/GROUPS',
    '/en/%67roups',
    '/en/%E0',
    '',
    null,
    undefined,
    'groups',
  ])('treats %s as private', (path) => {
    expect(isPrivatePath(path)).toBe(true);
  });

  it.each([
    '/',
    '/nl',
    '/en/',
    '/nl/q/beste-voetballer-ooit-k3x9ma',
    '/[locale]/q/[slug]',
    '/en/discover',
  ])('treats %s as public', (path) => {
    expect(isPrivatePath(path)).toBe(false);
  });
});

describe('beforeSend', () => {
  it('strips the query string and fragment from public pages', () => {
    expect(
      beforeSend({ type: 'pageview', url: 'https://guesshive.com/nl/q/abc?token=secret#x' }),
    ).toEqual({ type: 'pageview', url: 'https://guesshive.com/nl/q/abc' });
  });

  it('drops events on private pages and unparsable URLs', () => {
    expect(beforeSend({ type: 'pageview', url: 'https://guesshive.com/nl/groups/abc' })).toBeNull();
    expect(beforeSend({ type: 'event', url: 'https://guesshive.com/en/admin' })).toBeNull();
    expect(beforeSend({ type: 'pageview', url: 'not a url' })).toBeNull();
  });
});
