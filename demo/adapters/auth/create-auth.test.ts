import { describe, expect, it } from 'vitest';

import { createDb } from '#adapters/db/client.js';

import {
  createAuth,
  isAdditionalTwoFactorPath,
  isSuccessfulPasswordVerification,
  passwordResetOriginMatches,
} from './create-auth.js';

describe('two-factor sign-in coverage', () => {
  it.each([
    '/sign-in/social',
    '/callback/google',
    '/magic-link/verify',
    '/passkey/verify-authentication',
  ])('covers %s', (path) => {
    expect(isAdditionalTwoFactorPath(path)).toBe(true);
  });

  it('does not challenge an ordinary authenticated endpoint', () => {
    expect(isAdditionalTwoFactorPath('/change-password')).toBe(false);
  });
});

describe('password-reset redirect origin', () => {
  it('accepts the requesting tenant origin only', () => {
    const headers = new Headers({ origin: 'https://one.example' });
    expect(
      passwordResetOriginMatches(
        { redirectTo: 'https://one.example/reset-password' },
        headers,
      ),
    ).toBe(true);
    expect(
      passwordResetOriginMatches(
        { redirectTo: 'https://two.example/reset-password' },
        headers,
      ),
    ).toBe(false);
  });

  it('rejects malformed and originless requests', () => {
    expect(passwordResetOriginMatches({ redirectTo: 'not-a-url' }, new Headers())).toBe(false);
    expect(passwordResetOriginMatches({}, undefined)).toBe(false);
  });
});

describe('the password-reset origin rule on the composed provider', () => {
  // The origin rule rejects before any query runs, so the lazy pool behind this
  // connection string never opens a connection.
  const auth = createAuth(
    createDb('node-postgres', 'postgresql://user:pass@localhost:5432/agentproofarch_test'),
    {
      secret: 'test-secret-value-that-is-at-least-32-chars',
      baseUrl: 'https://one.example',
      baseDomain: 'example',
      rateLimitEnabled: false,
      trustedProxies: [],
      trustedOrigins: ['https://one.example', 'https://two.example'],
      secureCookies: true,
      email: { sendMail: async () => {} },
    },
  );

  const requestReset = (redirectTo: string) =>
    auth.handler(
      new Request('https://one.example/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://one.example' },
        body: JSON.stringify({ email: 'reset@example.com', redirectTo }),
      }),
    );

  it('rejects a callback aimed at another otherwise trusted origin', async () => {
    const response = await requestReset('https://two.example/reset-password');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_PASSWORD_RESET_ORIGIN' });
  });
});

describe('sensitive passkey management', () => {
  it('issues re-authentication proof only for successful password verification', () => {
    expect(isSuccessfulPasswordVerification({ status: true })).toBe(true);
    expect(isSuccessfulPasswordVerification({ status: false })).toBe(false);
    expect(isSuccessfulPasswordVerification({ error: 'invalid password' })).toBe(false);
  });
});
