/**
 * Demo seed: one user who belongs to two tenants, each with its own todos.
 *   email:    demo@agentproofarch.dev
 *   password: demo-agentproof-1234
 * Tenants: acme.localhost and globex.localhost (subdomains of APP_BASE_DOMAIN).
 * Convergent: running twice leaves the same state, and an already-seeded
 * database is brought back to the credentials documented above.
 */
import { and, eq } from 'drizzle-orm';

import { createAuth } from '#adapters/auth/create-auth.js';
import { seedEnvSchema } from '#core/server/config.js';

import { createDb } from './client.js';
import { account, members, tenantAdmins, tenantDomains, tenants, todos, user } from './schema.js';

const { DATABASE_URL: connectionString, BETTER_AUTH_SECRET } = seedEnvSchema.parse(process.env);

const db = createDb('node-postgres', connectionString);

const auth = createAuth(db, {
  secret: BETTER_AUTH_SECRET,
  baseUrl: 'http://localhost:47100',
  baseDomain: 'localhost',
  trustedOrigins: () => ['http://localhost:47100'],
  secureCookies: false,
  rateLimitEnabled: false,
  trustedProxies: [],
  // The seed signs up the demo user by password (no email is sent), so a
  // no-op sink satisfies the auth wiring without pulling in a live relay.
  email: { sendMail: async () => {} },
});

const DEMO_EMAIL = 'demo@agentproofarch.dev';
const DEMO_PASSWORD = 'demo-agentproof-1234';

const existing = await db.select().from(user).where(eq(user.email, DEMO_EMAIL)).limit(1);
if (existing.length === 0) {
  await auth.api.signUpEmail({
    body: { name: 'Demo User', email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
}
const seededUsers = await db.select().from(user).where(eq(user.email, DEMO_EMAIL)).limit(1);
const demoUser = seededUsers[0];
if (!demoUser) throw new Error('Seeded user not found');

// Nobody can ever follow a confirmation link for the demo address — there is no
// such mailbox — so the seed states the verified fact directly. Without it the
// demo account would be barred from `tenant:create`, which the demo is meant to
// show off.
if (!demoUser.emailVerified) {
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, demoUser.id));
}

// The credentials are published (README, login page), so an existing database
// has to CONVERGE on them, not keep whatever it was seeded with years ago —
// otherwise a password rotation would leave every already-seeded deployment
// contradicting its own documentation.
const { password } = await auth.$context;
await db
  .update(account)
  .set({ password: await password.hash(DEMO_PASSWORD) })
  .where(and(eq(account.userId, demoUser.id), eq(account.providerId, 'credential')));

const seededAt = Date.now();
const nowIso = new Date(seededAt).toISOString();

const tenantRows = [
  { id: 'tenant-acme', slug: 'acme', name: 'Acme Sp. z o.o.' },
  { id: 'tenant-globex', slug: 'globex', name: 'Globex Corp' },
];

await db.insert(tenants).values(tenantRows.map((tenant) => ({ ...tenant, createdAt: nowIso }))).onConflictDoNothing();

await db.insert(tenantAdmins).values(
  tenantRows.map((tenant, index) => ({
    id: `admin-${tenant.slug}`,
    tenantId: tenant.id,
    userId: demoUser.id,
    role: index === 0 ? ('owner' as const) : ('admin' as const),
  })),
).onConflictDoNothing();

await db.insert(members).values([
  {
    id: 'member-acme-alice',
    tenantId: 'tenant-acme',
    userId: 'customer-alice-opaque',
    email: 'alice@example.com',
    displayName: 'Alice Example',
    tags: ['vip', 'early-adopter'],
    marketingConsents: [{ channel: 'email', granted: true, updatedAt: nowIso }],
    externalCustomerIds: ['cus_acme_alice'],
    createdAt: nowIso,
    lastSeenAt: nowIso,
  },
  {
    // US-026: a passwordless provisioned member (no account yet). Its userId
    // binds on first magic-link sign-in into acme.localhost.
    id: 'member-acme-mag',
    tenantId: 'tenant-acme',
    userId: null,
    email: 'mag@example.com',
    displayName: 'Magic Link Member',
    tags: ['provisioned'],
    marketingConsents: [],
    externalCustomerIds: [],
    createdAt: nowIso,
    lastSeenAt: null,
  },
  {
    id: 'member-globex-bob',
    tenantId: 'tenant-globex',
    userId: 'customer-bob-opaque',
    email: 'bob@example.com',
    displayName: 'Bob Example',
    tags: [],
    marketingConsents: [{ channel: 'email', granted: false, updatedAt: nowIso }],
    externalCustomerIds: [],
    createdAt: nowIso,
    lastSeenAt: null,
  },
]).onConflictDoNothing();

await db.insert(tenantDomains).values(
  tenantRows.map((tenant) => ({
    id: `domain-${tenant.slug}`,
    tenantId: tenant.id,
    domain: `${tenant.slug}.localhost`,
    kind: 'subdomain' as const,
    verified: true,
  })),
).onConflictDoNothing();

const todoRows = [
  {
    id: 'todo-walking-skeleton',
    tenantId: 'tenant-acme',
    title: 'Wdrożyć walking skeleton na produkcję',
  },
  {
    id: 'todo-tenant-isolation',
    tenantId: 'tenant-acme',
    title: 'Sprawdzić izolację danych między tenantami',
  },
  {
    id: 'todo-globex-architecture',
    tenantId: 'tenant-globex',
    title: 'Globex: przygotować prezentację architektury',
  },
];

// Todos list by ascending `createdAt`, so one shared timestamp would leave the
// documented order down to Postgres; a second apart makes the listing stable.
await db.insert(todos).values(
  todoRows.map((todo, index) => ({
    ...todo,
    createdBy: demoUser.id,
    createdAt: new Date(seededAt + index * 1000).toISOString(),
  })),
).onConflictDoNothing();

console.log('Seed applied:');
console.log(`  user     ${DEMO_EMAIL} / demo-agentproof-1234`);
console.log('  tenants  http://acme.localhost:47100  http://globex.localhost:47100');
process.exit(0);
