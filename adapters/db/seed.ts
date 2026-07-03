/**
 * Demo seed: one user who belongs to two tenants, each with its own todos.
 *   email:    demo@agentproofarch.dev
 *   password: demo1234
 * Tenants: acme.localhost and globex.localhost (subdomains of APP_BASE_DOMAIN).
 * Idempotent: running twice is a no-op.
 */
import { eq } from 'drizzle-orm';

import { createAuth } from '@adapters/auth/create-auth.js';

import { createDb } from './client.js';
import { member, organization, tenantDomains, todos, user } from './schema.js';

const connectionString =
  process.env['DATABASE_URL'] ??
  'postgresql://agentproofarch:agentproofarch@localhost:47542/agentproofarch';

const db = createDb('node-postgres', connectionString);

const auth = createAuth(db, {
  secret: process.env['BETTER_AUTH_SECRET'] ?? 'dev-only-secret-do-not-use-in-prod',
  baseUrl: 'http://localhost:47100',
  baseDomain: 'localhost',
  trustedOrigins: ['http://localhost:47100'],
  secureCookies: false,
});

const DEMO_EMAIL = 'demo@agentproofarch.dev';

const existing = await db.select().from(user).where(eq(user.email, DEMO_EMAIL)).limit(1);
if (existing.length > 0) {
  console.log('Seed already applied, nothing to do.');
  process.exit(0);
}

await auth.api.signUpEmail({
  body: { name: 'Demo User', email: DEMO_EMAIL, password: 'demo1234' },
});
const seededUsers = await db.select().from(user).where(eq(user.email, DEMO_EMAIL)).limit(1);
const demoUser = seededUsers[0];
if (!demoUser) throw new Error('Seeded user not found');

const now = new Date();
const nowIso = now.toISOString();

const tenants = [
  { id: 'org-acme', slug: 'acme', name: 'Acme Sp. z o.o.' },
  { id: 'org-globex', slug: 'globex', name: 'Globex Corp' },
];

await db.insert(organization).values(tenants.map((t) => ({ ...t, createdAt: now })));

await db.insert(member).values(
  tenants.map((t, index) => ({
    id: `member-${t.slug}`,
    organizationId: t.id,
    userId: demoUser.id,
    role: index === 0 ? 'owner' : 'admin',
    createdAt: now,
  })),
);

await db.insert(tenantDomains).values(
  tenants.map((t) => ({
    id: `domain-${t.slug}`,
    tenantId: t.id,
    domain: `${t.slug}.localhost`,
    kind: 'subdomain' as const,
    verified: true,
  })),
);

await db.insert(todos).values([
  {
    id: crypto.randomUUID(),
    tenantId: 'org-acme',
    title: 'Wdrożyć walking skeleton na produkcję',
    createdBy: demoUser.id,
    createdAt: nowIso,
  },
  {
    id: crypto.randomUUID(),
    tenantId: 'org-acme',
    title: 'Sprawdzić izolację danych między tenantami',
    createdBy: demoUser.id,
    createdAt: nowIso,
  },
  {
    id: crypto.randomUUID(),
    tenantId: 'org-globex',
    title: 'Globex: przygotować prezentację architektury',
    createdBy: demoUser.id,
    createdAt: nowIso,
  },
]);

console.log('Seed applied:');
console.log(`  user     ${DEMO_EMAIL} / demo1234`);
console.log('  tenants  http://acme.localhost:47100  http://globex.localhost:47100');
process.exit(0);
