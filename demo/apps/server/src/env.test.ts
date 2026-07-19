import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadEnv } from './env.js';

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
    expect(loadEnv().SECURE_COOKIES).toBe(true);
  });
});
