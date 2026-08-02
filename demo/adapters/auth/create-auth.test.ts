import { describe, expect, it } from 'vitest';

import {
  isAdditionalTwoFactorPath,
  isSensitivePasskeyPath,
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

describe('sensitive passkey management', () => {
  it.each([
    '/passkey/generate-register-options',
    '/passkey/verify-registration',
    '/passkey/delete-passkey',
  ])('protects %s', (path) => {
    expect(isSensitivePasskeyPath(path)).toBe(true);
  });

  it('does not turn passkey sign-in into an authenticated management operation', () => {
    expect(isSensitivePasskeyPath('/passkey/verify-authentication')).toBe(false);
  });

  it('issues re-authentication proof only for successful password verification', () => {
    expect(isSuccessfulPasswordVerification({ status: true })).toBe(true);
    expect(isSuccessfulPasswordVerification({ status: false })).toBe(false);
    expect(isSuccessfulPasswordVerification({ error: 'invalid password' })).toBe(false);
  });
});
