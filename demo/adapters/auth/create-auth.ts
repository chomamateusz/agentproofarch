import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import {
  APIError,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
  sensitiveSessionMiddleware,
} from 'better-auth/api';
import { bearer } from 'better-auth/plugins';
import { magicLink } from 'better-auth/plugins/magic-link';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { passkey } from '@better-auth/passkey';
import { z } from 'zod';

import { PASSWORD_MIN_LENGTH } from '#core/domain/index.js';
import type { AuthPort, EmailPort } from '#core/server/index.js';
import type { Db } from '#adapters/db/client.js';

export interface GoogleSettings {
  clientId: string;
  clientSecret: string;
}

export interface AuthSettings {
  secret: string;
  /** Public URL of the API, e.g. http://localhost:47100 */
  baseUrl: string;
  /** Cookie domain root so sessions survive tenant subdomains, e.g. "localhost". */
  baseDomain: string;
  trustedOrigins: string[] | ((request?: Request) => string[] | Promise<string[]>);
  secureCookies: boolean;
  /** Off only in test harnesses (e2e drives many sign-ins from one bucket). */
  rateLimitEnabled: boolean;
  trustedProxies: readonly string[];
  /** Delivers the transactional links (magic sign-in, password reset); dev/CI capture them in Mailpit. */
  email: EmailPort;
  /** Wired only when both env keys are present (FR-26), like SENTRY_DSN gating. */
  google?: GoogleSettings;
}

export const BETTER_AUTH_API_PATH_PATTERN = '/api/auth/*';

const magicLinkSubject = 'Your Agentproofarch sign-in link';
const passwordResetSubject = 'Reset your Agentproofarch password';
const emailVerificationSubject = 'Confirm your Agentproofarch email address';
const passwordResetRequestSchema = z.object({ redirectTo: z.url() });
const PASSKEY_SENSITIVE_COOKIE = 'passkey_sensitive';
const PASSKEY_SENSITIVE_MAX_AGE_SECONDS = 5 * 60;

/**
 * Long enough to survive a mail relay and a distracted human, short enough that a
 * leaked inbox stops being a standing credential. Better Auth's own default, made
 * explicit because it is a security parameter.
 */
const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * The session and 2FA parameters the owner pinned on 2026-08-02. Each value is
 * also the provider's current default: writing them down turns "whatever Better
 * Auth ships today" into a reviewed decision that a dependency bump cannot move
 * silently, and `config-regression/auth-policy.test.ts` reads them back off the
 * composed options, so a drift fails `check` instead of shipping.
 */
export const AUTH_POLICY = {
  /** Absolute session lifetime — an older session is dead whether or not it was used. */
  sessionExpiresInSeconds: 60 * 60 * 24 * 7,
  /** Activity refresh: a session used past this age is extended back to the full window. */
  sessionUpdateAgeSeconds: 60 * 60 * 24,
  twoFactorBackupCodeCount: 10,
  totpDigits: 6,
  totpPeriodSeconds: 30,
} as const;

export const authIpAddressSettings = (rateLimitEnabled: boolean, trustedProxies: readonly string[]) => {
  if (rateLimitEnabled && trustedProxies.length === 0) {
    throw new Error('AUTH_RATE_LIMIT requires at least one trusted proxy');
  }
  return { trustedProxies: [...trustedProxies] };
};

export const passwordResetOriginMatches = (body: unknown, headers: Headers | undefined): boolean => {
  const parsed = passwordResetRequestSchema.safeParse(body);
  const origin = headers?.get('origin');
  const parsedOrigin = z.url().safeParse(origin);
  return (
    parsed.success &&
    parsedOrigin.success &&
    new URL(parsed.data.redirectTo).origin === new URL(parsedOrigin.data).origin
  );
};

const tenantScopedPasswordReset = () => ({
  id: 'tenant-scoped-password-reset',
  hooks: {
    before: [
      {
        matcher: (context: { path?: string }) => context.path === '/request-password-reset',
        handler: createAuthMiddleware(async (ctx) => {
          if (!passwordResetOriginMatches(ctx.body, ctx.headers)) {
            throw APIError.from('BAD_REQUEST', {
              code: 'INVALID_PASSWORD_RESET_ORIGIN',
              message: 'Password reset must return to the origin that requested it',
            });
          }
        }),
      },
    ],
  },
});

export const isSuccessfulPasswordVerification = (result: unknown): boolean =>
  z.object({ status: z.literal(true) }).safeParse(result).success;

const passkeyProofMiddleware = createAuthMiddleware(async (ctx) => {
  const session = await getAuthoritativeSessionFromCtx(ctx);
  const cookie = ctx.context.createAuthCookie(PASSKEY_SENSITIVE_COOKIE, {
    maxAge: PASSKEY_SENSITIVE_MAX_AGE_SECONDS,
  });
  const verifiedUserId = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!session || verifiedUserId !== session.user.id) {
    throw APIError.from('FORBIDDEN', {
      code: 'PASSKEY_REAUTHENTICATION_REQUIRED',
      message: 'Verify your account password before managing passkeys',
    });
  }
  return { session };
});

const sensitivePasskeyManagement = () => ({
  id: 'sensitive-passkey-management',
  hooks: {
    after: [
      {
        matcher: (context: { path?: string }) => context.path === '/verify-password',
        handler: createAuthMiddleware(async (ctx) => {
          if (!isSuccessfulPasswordVerification(ctx.context.returned)) return;
          const session = await getAuthoritativeSessionFromCtx(ctx);
          if (!session) return;
          const cookie = ctx.context.createAuthCookie(PASSKEY_SENSITIVE_COOKIE, {
            maxAge: PASSKEY_SENSITIVE_MAX_AGE_SECONDS,
          });
          await ctx.setSignedCookie(
            cookie.name,
            session.user.id,
            ctx.context.secret,
            cookie.attributes,
          );
        }),
      },
    ],
  },
});

const passkeyWithSensitiveManagement = (baseDomain: string) => {
  const plugin = passkey({ rpID: baseDomain, rpName: 'Agentproofarch' });
  plugin.endpoints.generatePasskeyRegistrationOptions.options.use.push(
    sensitiveSessionMiddleware,
    passkeyProofMiddleware,
  );
  plugin.endpoints.verifyPasskeyRegistration.options.use.push(
    sensitiveSessionMiddleware,
    passkeyProofMiddleware,
  );
  plugin.endpoints.deletePasskey.options.use.push(
    sensitiveSessionMiddleware,
    passkeyProofMiddleware,
  );
  return plugin;
};

const additionalTwoFactorPaths = new Set([
  '/sign-in/social',
  '/magic-link/verify',
  '/passkey/verify-authentication',
]);

export const isAdditionalTwoFactorPath = (path: string | undefined): boolean =>
  path !== undefined && (additionalTwoFactorPaths.has(path) || path.startsWith('/callback/'));

const twoFactorForEverySignIn = () => {
  const plugin = twoFactor({
    totpOptions: { digits: AUTH_POLICY.totpDigits, period: AUTH_POLICY.totpPeriodSeconds },
    backupCodeOptions: { amount: AUTH_POLICY.twoFactorBackupCodeCount },
  });
  return {
    ...plugin,
    hooks: {
      ...plugin.hooks,
      after: plugin.hooks.after.map((hook) => ({
        ...hook,
        matcher: (context: Parameters<typeof hook.matcher>[0]) =>
          hook.matcher(context) || isAdditionalTwoFactorPath(context.path),
      })),
    },
  };
};

const twoFactorRedirectSchema = z.object({ twoFactorRedirect: z.literal(true) });

const redirectTwoFactorNavigation = (baseUrl: string) => ({
  id: 'two-factor-navigation',
  hooks: {
    after: [
      {
        matcher: (context: { path?: string }) =>
          context.path === '/magic-link/verify' || context.path?.startsWith('/callback/') === true,
        handler: createAuthMiddleware(async (ctx) => {
          if (!twoFactorRedirectSchema.safeParse(ctx.context.returned).success) return;
          const location = ctx.context.responseHeaders?.get('location');
          const parsedLocation = z.url().safeParse(location);
          const origin = parsedLocation.success ? new URL(parsedLocation.data).origin : new URL(baseUrl).origin;
          throw ctx.redirect(new URL('/login?twoFactor=required', origin).toString());
        }),
      },
    ],
  },
});

export const createAuth = (db: Db, settings: AuthSettings) =>
  betterAuth({
    database: drizzleAdapter(db, { provider: 'pg' }),
    secret: settings.secret,
    baseURL: settings.baseUrl,
    trustedOrigins: settings.trustedOrigins,
    session: {
      expiresIn: AUTH_POLICY.sessionExpiresInSeconds,
      updateAge: AUTH_POLICY.sessionUpdateAgeSeconds,
    },
    // SOFT verification: an account works the moment it exists — sign-in, boards,
    // membership — and only `tenant:create` waits for the confirmation
    // (core/domain/authorization.ts). Hence `requireEmailVerification` stays off
    // explicitly rather than by default, while the mail goes out on sign-up.
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await settings.email.sendMail({
          to: user.email,
          subject: emailVerificationSubject,
          text: `Confirm your Agentproofarch email address:\n\n${url}\n\nYour account already works without this — confirming only unlocks creating your own tenant.`,
          link: url,
        });
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_TOKEN_TTL_SECONDS,
      // A reset is what someone does after losing control of the account, so the
      // sessions opened with the old password must not survive it (off by default).
      revokeSessionsOnPasswordReset: true,
      // `url` is the provider's callback: it validates the token and redirects to
      // the caller's `redirectTo` (the app's /reset-password form) carrying it.
      sendResetPassword: async ({ user, url }) => {
        await settings.email.sendMail({
          to: user.email,
          subject: passwordResetSubject,
          text: `Reset your Agentproofarch password:\n\n${url}\n\nThe link opens the reset form and expires in an hour. If you did not ask for it, ignore this email — nothing changes until the form is submitted.`,
          link: url,
        });
      },
    },
    ...(settings.google
      ? { socialProviders: { google: { clientId: settings.google.clientId, clientSecret: settings.google.clientSecret } } }
      : {}),
    // In-memory counters reset with every serverless isolate, so the limiter
    // stores its windows in the database we already have (no Redis needed).
    rateLimit: { enabled: settings.rateLimitEnabled, storage: 'database' },
    plugins: [
      bearer(),
      tenantScopedPasswordReset(),
      sensitivePasskeyManagement(),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await settings.email.sendMail({
            to: email,
            subject: magicLinkSubject,
            text: `Sign in to Agentproofarch:\n\n${url}\n\nThis link signs you in and expires shortly.`,
            link: url,
          });
        },
      }),
      twoFactorForEverySignIn(),
      redirectTwoFactorNavigation(settings.baseUrl),
      // rpID is the registrable domain the credential is scoped to; keying it on
      // the base domain lets one passkey work across every tenant subdomain
      // (browsers scope WebAuthn to the registrable suffix, not the full origin).
      passkeyWithSensitiveManagement(settings.baseDomain),
    ],
    advanced: {
      useSecureCookies: settings.secureCookies,
      ipAddress: authIpAddressSettings(settings.rateLimitEnabled, settings.trustedProxies),
      // Browsers reject Domain=.localhost cookies, so sessions are per-subdomain
      // in local dev; on a real base domain they span all tenant subdomains.
      ...(settings.baseDomain === 'localhost'
        ? {}
        : { crossSubDomainCookies: { enabled: true, domain: `.${settings.baseDomain}` } }),
    },
  });

export type Auth = ReturnType<typeof createAuth>;

/** AuthPort implementation: the only place the core's identity touches Better Auth. */
export const createAuthPort = (auth: Auth): AuthPort => ({
  getAuthenticatedUser: async (requestHeaders) => {
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) return null;
    return {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: session.user.emailVerified,
    };
  },
});
