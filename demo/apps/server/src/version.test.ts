import { describe, expect, it } from 'vitest';

import { APP_VERSION } from './version.js';

describe('APP_VERSION', () => {
  it('is strict SemVer, so the single release-identity source can never be a free-form string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
