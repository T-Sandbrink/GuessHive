import { K_ANONYMITY_THRESHOLD, localeSchema } from '@guesshive/shared';
import { describe, expect, it } from 'vitest';

// Smoke test: the web app resolves the built @guesshive/shared package.
describe('@guesshive/shared in web', () => {
  it('exposes schemas and constants', () => {
    expect(localeSchema.parse('nl')).toBe('nl');
    expect(K_ANONYMITY_THRESHOLD).toBe(10);
  });
});
