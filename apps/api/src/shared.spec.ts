import { K_ANONYMITY_THRESHOLD, localeSchema } from '@guesshive/shared';
import { describe, expect, it } from 'vitest';

// Smoke test: the api resolves the built @guesshive/shared package (ESM, nodenext).
describe('@guesshive/shared in api', () => {
  it('exposes schemas and constants', () => {
    expect(localeSchema.parse('en')).toBe('en');
    expect(K_ANONYMITY_THRESHOLD).toBe(10);
  });
});
