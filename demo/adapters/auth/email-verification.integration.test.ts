import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuth, createAuthPort, type Auth } from '#adapters/auth/create-auth.js';
import * as schema from '#adapters/db/schema.js';
import { decide } from '#core/domain/index.js';

const ITEST_DB = 'agentproofarch_verification_itest';
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
const captured: { subject: string; link: string | null }[] = [];

const post = async (
  path: string,
  body: unknown,
  bearer?: string,
): Promise<{ status: number; token: string | null; json: unknown }> => {
  const response = await auth.handler(
    new Request(new URL(path, BASE_URL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: BASE_URL,
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    token: response.headers.get('set-auth-token'),
    json: text ? JSON.parse(text) : null,
  };
};

const verifiedFlag = async (email: string): Promise<boolean> => {
  const rows = await authPool.query('SELECT email_verified FROM "user" WHERE email = $1', [email]);
  return rows.rows[0]?.email_verified === true;
};

const linkFor = (subject: string): string => {
  const message = captured.findLast((entry) => entry.subject === subject);
  if (!message?.link) throw new Error(`No link captured for "${subject}"`);
  return message.link;
};

const identityOf = (emailVerified: boolean) => ({
  userId: 'u1',
  email: 'verify@example.com',
  name: 'Verify',
  emailVerified,
  tenantId: null,
  tenantSlug: null,
  tenantName: null,
  staffRole: null,
  memberId: null,
});

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
    secret: 'verification-itest-secret-32-characters',
    baseUrl: BASE_URL,
    baseDomain: 'localhost',
    trustedOrigins: [BASE_URL],
    secureCookies: false,
    rateLimitEnabled: false,
    trustedProxies: [],
    email: {
      sendMail: async (message) => {
        captured.push({ subject: message.subject, link: message.link ?? null });
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

const VERIFICATION_SUBJECT = 'Confirm your Agentproofarch email address';

describe('soft email verification against the real Better Auth stack', () => {
  const email = 'verify@example.com';
  const password = 'verify-agentproof-1234';
  let sessionToken = '';

  it('signs the account straight in and mails a confirmation link', async () => {
    const signedUp = await post('/api/auth/sign-up/email', { name: 'Verify', email, password });

    expect(signedUp.status).toBe(200);
    expect(signedUp.token).not.toBeNull();
    sessionToken = signedUp.token ?? '';
    expect(await verifiedFlag(email)).toBe(false);
    expect(linkFor(VERIFICATION_SUBJECT)).toContain('/api/auth/verify-email');
  });

  it('lets the unverified account sign in — verification is soft, not a wall', async () => {
    const signedIn = await post('/api/auth/sign-in/email', { email, password });

    expect(signedIn.status).toBe(200);
    expect(await verifiedFlag(email)).toBe(false);
  });

  it('reports the unverified state through AuthPort, which denies tenant:create', async () => {
    const port = createAuthPort(auth);

    const user = await port.getAuthenticatedUser(
      new Headers({ authorization: `Bearer ${sessionToken}` }),
    );

    expect(user).toMatchObject({ email, emailVerified: false });
    expect(decide(identityOf(user?.emailVerified === true), 'tenant:create', 'open')).toEqual({
      allowed: false,
      reason: 'tenant:create requires a verified email address',
    });
  });

  it('marks the address verified when the emailed link is followed', async () => {
    const followed = await auth.handler(
      new Request(linkFor(VERIFICATION_SUBJECT), { redirect: 'manual' }),
    );

    expect(followed.status).toBeLessThan(400);
    expect(await verifiedFlag(email)).toBe(true);
  });

  it('then reports verified through AuthPort, which allows tenant:create', async () => {
    const port = createAuthPort(auth);

    const user = await port.getAuthenticatedUser(
      new Headers({ authorization: `Bearer ${sessionToken}` }),
    );

    expect(user).toMatchObject({ email, emailVerified: true });
    expect(decide(identityOf(user?.emailVerified === true), 'tenant:create', 'open')).toEqual({
      allowed: true,
    });
  });

  it('re-sends the confirmation link on request, to the callback the banner asks for', async () => {
    const pending = 'resend@example.com';
    await post('/api/auth/sign-up/email', {
      name: 'Resend',
      email: pending,
      password: 'resend-agentproof-1234',
    });
    const before = captured.length;

    const resent = await post('/api/auth/send-verification-email', {
      email: pending,
      callbackURL: `${BASE_URL}/app`,
    });

    expect(resent.status).toBe(200);
    expect(captured.length).toBeGreaterThan(before);
    expect(linkFor(VERIFICATION_SUBJECT)).toContain(encodeURIComponent(`${BASE_URL}/app`));
  });

  it('answers a resend for an already-confirmed address without mailing anything', async () => {
    const before = captured.length;

    const resent = await post('/api/auth/send-verification-email', { email });

    expect(resent.status).toBe(200);
    expect(captured).toHaveLength(before);
  });

  it('refuses a sign-up under the twelve-character password floor', async () => {
    const tooShort = await post('/api/auth/sign-up/email', {
      name: 'Short',
      email: 'short@example.com',
      password: 'elevenchars',
    });

    expect(tooShort.status).toBeGreaterThanOrEqual(400);
    const rows = await authPool.query('SELECT id FROM "user" WHERE email = $1', [
      'short@example.com',
    ]);
    expect(rows.rows).toHaveLength(0);
  });
});
