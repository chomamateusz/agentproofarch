import { generateSync } from 'otplib';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createAuth, type Auth } from '#adapters/auth/create-auth.js';
import * as schema from '#adapters/db/schema.js';

const ITEST_DB = 'agentproofarch_twofactor_itest';
const baseDatabaseUrl =
  process.env['DATABASE_URL'] ?? 'postgresql://agentproofarch:agentproofarch@localhost:47542/agentproofarch';
const itestUrl = (() => {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${ITEST_DB}`;
  return url.toString();
})();

const BASE_URL = 'http://localhost:47100';
let auth: Auth;
let authPool: pg.Pool;
let capturedLink: string | null = null;

const call = async (
  path: string,
  body: unknown,
  bearer?: string,
  cookie?: string,
): Promise<{ status: number; token: string | null; cookies: string[]; json: unknown }> => {
  const response = await auth.handler(
    new Request(new URL(path, BASE_URL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: BASE_URL,
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    token: response.headers.get('set-auth-token'),
    cookies: response.headers.getSetCookie(),
    json: text ? JSON.parse(text) : null,
  };
};

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: baseDatabaseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ITEST_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ITEST_DB}`);
  } finally {
    await admin.end();
  }
  const migrationPool = new pg.Pool({ connectionString: itestUrl });
  try {
    await migrateNodePg(drizzleNodePg(migrationPool), { migrationsFolder: 'drizzle' });
  } finally {
    await migrationPool.end();
  }
  authPool = new pg.Pool({ connectionString: itestUrl });
  // The FORCE drop in afterAll can terminate a still-open pooled socket; sink the
  // resulting 'error' so the teardown race never fails the suite (integration
  // teardown doctrine).
  authPool.on('error', () => {});
  auth = createAuth(drizzleNodePg(authPool, { schema }), {
    secret: 'two-factor-itest-secret-32-characters',
    baseUrl: BASE_URL,
    baseDomain: 'localhost',
    trustedOrigins: [BASE_URL],
    secureCookies: false,
    rateLimitEnabled: false,
    trustedProxies: [],
    email: {
      sendMail: async (message) => {
        capturedLink = message.link ?? null;
      },
    },
  });
});

afterAll(async () => {
  await authPool.end().catch(() => {});
  const admin = new pg.Client({ connectionString: baseDatabaseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ITEST_DB} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
});

const totpEnableSchema = z.object({ totpURI: z.string(), backupCodes: z.array(z.string()) });
const secretOf = (totpURI: string): string => {
  const secret = new URL(totpURI).searchParams.get('secret');
  if (!secret) throw new Error('totpURI carried no secret');
  return secret;
};

describe('TOTP 2FA against the real Better Auth stack (US-028a)', () => {
  const email = 'tfa@example.com';
  const password = 'tfa-password-1234';
  let backupCode = '';

  it('enables 2FA, verifies an otplib-generated code, then requires it on the next login', async () => {
    const signedUp = await call('/api/auth/sign-up/email', { name: 'TFA', email, password });
    expect(signedUp.token).not.toBeNull();
    const token = signedUp.token ?? '';

    const enabled = await call('/api/auth/two-factor/enable', { password }, token);
    expect(enabled.status).toBe(200);
    const enrolment = totpEnableSchema.parse(enabled.json);
    const { totpURI } = enrolment;
    backupCode = enrolment.backupCodes[0] ?? '';

    const code = generateSync({ secret: secretOf(totpURI) });
    const verified = await call('/api/auth/two-factor/verify-totp', { code }, token);
    expect(verified.status).toBe(200);

    // The otplib-generated code was accepted and enrolment persisted: the user
    // now carries twoFactorEnabled and a secret-bearing two_factor row.
    const flag = await authPool.query('SELECT two_factor_enabled FROM "user" WHERE email = $1', [email]);
    expect(flag.rows[0]?.two_factor_enabled).toBe(true);
    const secretRow = await authPool.query(
      'SELECT tf.secret FROM two_factor tf JOIN "user" u ON u.id = tf.user_id WHERE u.email = $1',
      [email],
    );
    expect(String(secretRow.rows[0]?.secret ?? '').length).toBeGreaterThan(0);

    const gated = await call('/api/auth/sign-in/email', { email, password });
    expect(gated.status).toBe(200);
    expect(gated.json).toMatchObject({ twoFactorRedirect: true });
  });

  it('turns a magic-link sign-in into a second-factor challenge completed by a backup code', async () => {
    capturedLink = null;
    const requested = await call('/api/auth/sign-in/magic-link', {
      email,
      callbackURL: `${BASE_URL}/app`,
    });
    expect(requested.status).toBe(200);
    expect(capturedLink).not.toBeNull();

    const verifiedLink = await auth.handler(new Request(capturedLink ?? '', { redirect: 'manual' }));
    expect(verifiedLink.status).toBe(302);
    expect(verifiedLink.headers.get('location')).toBe(`${BASE_URL}/login?twoFactor=required`);
    const setCookies = verifiedLink.headers.getSetCookie();
    const sessionCookies = setCookies.filter((entry) =>
      entry.startsWith('better-auth.session_token='),
    );
    expect(sessionCookies).not.toHaveLength(0);
    expect(sessionCookies.at(-1)).toContain('Max-Age=0');
    const challengeCookie = setCookies
      .find((entry) => entry.startsWith('better-auth.two_factor='))
      ?.split(';')[0];
    expect(challengeCookie).toBeDefined();

    const completed = await call(
      '/api/auth/two-factor/verify-backup-code',
      { code: backupCode },
      undefined,
      challengeCookie,
    );
    expect(completed.status).toBe(200);
    expect(completed.json).toMatchObject({ token: expect.any(String) });
  });

  it('rejects a wrong TOTP code', async () => {
    const email2 = 'tfa2@example.com';
    const signedUp = await call('/api/auth/sign-up/email', { name: 'TFA2', email: email2, password });
    const token = signedUp.token ?? '';
    await call('/api/auth/two-factor/enable', { password }, token);

    const bad = await call('/api/auth/two-factor/verify-totp', { code: '000000' }, token);
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });

  it('requires successful password verification before passkey registration begins', async () => {
    const passkeyEmail = 'passkey-sensitive@example.com';
    const signedUp = await call('/api/auth/sign-up/email', {
      name: 'Passkey Sensitive',
      email: passkeyEmail,
      password,
    });
    const sessionCookie = signedUp.cookies
      .find((entry) => entry.startsWith('better-auth.session_token='))
      ?.split(';')[0];
    expect(sessionCookie).toBeDefined();
    const registrationRequest = (proofCookie?: string) =>
      auth.handler(
        new Request(new URL('/api/auth/passkey/generate-register-options', BASE_URL), {
          headers: {
            origin: BASE_URL,
            cookie: [sessionCookie, proofCookie].filter((value) => value !== undefined).join('; '),
          },
        }),
      );

    expect((await registrationRequest()).status).toBe(403);

    const rejected = await call(
      '/api/auth/verify-password',
      { password: 'wrong-password' },
      undefined,
      sessionCookie,
    );
    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.cookies.some((entry) => entry.includes('.passkey_sensitive='))).toBe(false);

    const verified = await call(
      '/api/auth/verify-password',
      { password },
      undefined,
      sessionCookie,
    );
    expect(verified.status).toBe(200);
    const proofCookie = verified.cookies
      .find((entry) => entry.includes('.passkey_sensitive='))
      ?.split(';')[0];
    expect(proofCookie).toBeDefined();
    expect((await registrationRequest(proofCookie)).status).toBe(200);
  });
});
