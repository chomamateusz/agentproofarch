import type { WriteResult } from './http.js';

export interface AuthSessionResult {
  token: string | null;
}

/** A social identity provider the app can offer (FR-26). */
export type SocialProvider = 'google';

export interface SocialSignInInput {
  provider: SocialProvider;
  /** Where the provider returns the user after consent; defaults to the app root. */
  callbackURL?: string;
}

export interface SocialSignInResult {
  /** The provider authorization URL the client redirects to, or null on failure. */
  url: string | null;
}

export interface MagicLinkRequest {
  email: string;
  /** Where the verified link lands the user; defaults to the app root. */
  callbackURL?: string;
}

export interface TwoFactorEnableResult {
  /** otpauth:// URI for an authenticator app (rendered as a QR by the UI). */
  totpURI: string;
  backupCodes: string[];
}

/**
 * Client-side auth port. Web (and future mobile/Electron/CLI) programs against
 * this interface; the Better Auth client adapter implements it. It is the
 * EXCLUSIVE surface for provider auth methods (US-028a) — magic link, social,
 * and TOTP 2FA — so no client ever names a provider route or SDK directly.
 * Session state itself is read through the API (`/api/me`), not through here.
 * Auth side effects are commands, so every method returns a write-tagged result.
 */
export interface AuthClientPort {
  signUp(input: { name: string; email: string; password: string }): Promise<WriteResult<AuthSessionResult>>;
  signIn(input: { email: string; password: string }): Promise<WriteResult<AuthSessionResult>>;
  signOut(): Promise<WriteResult<void>>;
  /** US-026: request a passwordless magic link; no real delivery in dev. */
  requestMagicLink(input: MagicLinkRequest): Promise<WriteResult<void>>;
  /** FR-26: begin a social sign-in, yielding the provider authorization URL. */
  signInSocial(input: SocialSignInInput): Promise<WriteResult<SocialSignInResult>>;
  /** US-028a: turn on TOTP 2FA, returning the enrolment URI + backup codes. */
  enableTwoFactor(input: { password: string }): Promise<WriteResult<TwoFactorEnableResult>>;
  /** US-028a: confirm enrolment (or step-up) with a code from the authenticator. */
  verifyTotp(input: { code: string }): Promise<WriteResult<void>>;
  /** US-028a: turn off TOTP 2FA (re-auth with the account password). */
  disableTwoFactor(input: { password: string }): Promise<WriteResult<void>>;
}
