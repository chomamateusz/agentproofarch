import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AUTH_POLICY, createAuth } from '#adapters/auth/create-auth.js';
import { createDb } from '#adapters/db/client.js';
import { PASSWORD_MIN_LENGTH } from '#core/domain/index.js';

/**
 * Behavioural config-regression probe for the auth policy the owner pinned on
 * 2026-08-02. It reads the values back off a REAL composed Better Auth instance
 * — not off the constants — so removing a knob from `createAuth`, or a provider
 * bump that moves a default the app relies on, fails `check` instead of shipping.
 * `createDb` opens no connection until a query runs, so this stays database-free.
 */
const auth = createAuth(
  createDb('node-postgres', 'postgresql://probe:probe@localhost:1/probe'),
  {
    secret: 'auth-policy-probe-secret-32-characters',
    baseUrl: 'http://localhost:47100',
    baseDomain: 'localhost',
    trustedOrigins: ['http://localhost:47100'],
    secureCookies: false,
    rateLimitEnabled: false,
    trustedProxies: [],
    email: { sendMail: async () => {} },
  },
);

const twoFactorSchema = z.object({
  id: z.literal('two-factor'),
  options: z.object({
    totpOptions: z.object({ digits: z.number(), period: z.number() }),
    backupCodeOptions: z.object({ amount: z.number() }),
  }),
});

const twoFactorPlugin = auth.options.plugins.flatMap((plugin) => {
  const parsed = twoFactorSchema.safeParse(plugin);
  return parsed.success ? [parsed.data] : [];
})[0];

describe('session policy', () => {
  it('pins the 7-day expiry and the 1-day activity refresh explicitly', () => {
    expect(AUTH_POLICY.sessionExpiresInSeconds).toBe(60 * 60 * 24 * 7);
    expect(AUTH_POLICY.sessionUpdateAgeSeconds).toBe(60 * 60 * 24);
    expect(auth.options.session?.expiresIn).toBe(AUTH_POLICY.sessionExpiresInSeconds);
    expect(auth.options.session?.updateAge).toBe(AUTH_POLICY.sessionUpdateAgeSeconds);
  });

  it('keeps the refresh window inside the expiry, so activity really extends a session', () => {
    expect(AUTH_POLICY.sessionUpdateAgeSeconds).toBeLessThan(AUTH_POLICY.sessionExpiresInSeconds);
  });
});

describe('two-factor policy', () => {
  it('mints ten backup codes', () => {
    expect(AUTH_POLICY.twoFactorBackupCodeCount).toBe(10);
    expect(twoFactorPlugin?.options.backupCodeOptions.amount).toBe(10);
  });

  it('uses 6-digit TOTP codes on a 30-second period', () => {
    expect(AUTH_POLICY.totpDigits).toBe(6);
    expect(AUTH_POLICY.totpPeriodSeconds).toBe(30);
    expect(twoFactorPlugin?.options.totpOptions.digits).toBe(6);
    expect(twoFactorPlugin?.options.totpOptions.period).toBe(30);
  });
});

describe('password and email-verification policy', () => {
  it('hands the provider the same twelve-character floor the forms enforce', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(auth.options.emailAndPassword?.minPasswordLength).toBe(PASSWORD_MIN_LENGTH);
  });

  it('keeps verification SOFT: mail on sign-up, but never a sign-in wall', () => {
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(false);
    expect(auth.options.emailVerification?.sendOnSignUp).toBe(true);
    expect(auth.options.emailVerification?.sendVerificationEmail).toBeTypeOf('function');
  });
});
