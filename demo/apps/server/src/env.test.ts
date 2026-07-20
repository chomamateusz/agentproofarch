import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEV_ONLY_SECRET, loadEnv, parseEnv } from './env.js';

beforeEach(() => {
  vi.stubEnv('AUTH_RATE_LIMIT', undefined);
  vi.stubEnv('APP_BASE_URL', undefined);
  vi.stubEnv('VERCEL_URL', undefined);
  vi.stubEnv('SECURE_COOKIES', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('loadEnv', () => {
  it('keeps the auth rate limiter on by default', () => {
    expect(loadEnv().AUTH_RATE_LIMIT).toBe(true);
  });

  it('turns the limiter off only on the explicit harness knob', () => {
    vi.stubEnv('AUTH_RATE_LIMIT', 'off');
    expect(loadEnv().AUTH_RATE_LIMIT).toBe(false);
  });

  it('derives the base URL from VERCEL_URL when APP_BASE_URL is unset', () => {
    vi.stubEnv('VERCEL_URL', 'preview-abc.vercel.app');
    expect(loadEnv().APP_BASE_URL).toBe('https://preview-abc.vercel.app');
  });

  it('prefers an explicit APP_BASE_URL over the deployment URL', () => {
    vi.stubEnv('VERCEL_URL', 'preview-abc.vercel.app');
    vi.stubEnv('APP_BASE_URL', 'https://agentproofarch.vercel.app');
    expect(loadEnv().APP_BASE_URL).toBe('https://agentproofarch.vercel.app');
  });

  it('parses SECURE_COOKIES as a boolean flag', () => {
    vi.stubEnv('SECURE_COOKIES', 'true');
    // A non-Vercel deploy with hardened cookies must supply a real secret.
    vi.stubEnv('BETTER_AUTH_SECRET', 'a-real-production-secret-value');
    expect(loadEnv().SECURE_COOKIES).toBe(true);
  });

  it('exposes the commit SHA when set, undefined otherwise', () => {
    expect(loadEnv().APP_COMMIT_SHA).toBeUndefined();
    vi.stubEnv('APP_COMMIT_SHA', 'deadbeef');
    expect(loadEnv().APP_COMMIT_SHA).toBe('deadbeef');
  });
});

// A minimal source that parses clean in local dev (neither deploy signal set).
const localDev = (): NodeJS.ProcessEnv => ({
  DB_DRIVER: 'node-postgres',
  BETTER_AUTH_SECRET: DEV_ONLY_SECRET,
});

// A minimal source that parses clean once deployed on Vercel.
const deployed = (): NodeJS.ProcessEnv => ({
  VERCEL: '1',
  DB_DRIVER: 'neon-http',
  SECURE_COOKIES: 'true',
  BETTER_AUTH_SECRET: 'a-real-production-secret-value',
});

describe('production env hardening (B2)', () => {
  it('accepts the dev-only defaults in local dev', () => {
    expect(parseEnv(localDev()).success).toBe(true);
  });

  it('accepts a fully hardened Vercel deployment', () => {
    expect(parseEnv(deployed()).success).toBe(true);
  });

  describe('the dev-only BETTER_AUTH_SECRET sentinel', () => {
    it('is allowed in local dev', () => {
      expect(parseEnv({ ...localDev(), BETTER_AUTH_SECRET: DEV_ONLY_SECRET }).success).toBe(true);
    });

    it('is refused on Vercel', () => {
      const result = parseEnv({ ...deployed(), BETTER_AUTH_SECRET: DEV_ONLY_SECRET });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.BETTER_AUTH_SECRET).toBeDefined();
      }
    });

    it('is refused whenever SECURE_COOKIES is on (self-host prod)', () => {
      const result = parseEnv({
        DB_DRIVER: 'node-postgres',
        SECURE_COOKIES: 'true',
        BETTER_AUTH_SECRET: DEV_ONLY_SECRET,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('SECURE_COOKIES=false', () => {
    it('is allowed in local dev', () => {
      expect(parseEnv({ ...localDev(), SECURE_COOKIES: 'false' }).success).toBe(true);
    });

    it('is refused on Vercel', () => {
      const result = parseEnv({ ...deployed(), SECURE_COOKIES: 'false' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.SECURE_COOKIES).toBeDefined();
      }
    });
  });

  describe('DB_DRIVER on Vercel', () => {
    it('accepts neon-http', () => {
      expect(parseEnv({ ...deployed(), DB_DRIVER: 'neon-http' }).success).toBe(true);
    });

    it('refuses node-postgres', () => {
      const result = parseEnv({ ...deployed(), DB_DRIVER: 'node-postgres' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.DB_DRIVER).toBeDefined();
      }
    });

    it('leaves node-postgres untouched off Vercel', () => {
      expect(parseEnv({ ...localDev(), DB_DRIVER: 'node-postgres' }).success).toBe(true);
    });
  });
});
