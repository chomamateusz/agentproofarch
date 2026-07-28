import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ITEST_DB = 'agentproofarch_seed_itest';
const baseDatabaseUrl =
  process.env['DATABASE_URL'] ??
  'postgresql://agentproofarch:agentproofarch@localhost:47542/agentproofarch';
const seedDatabaseUrl = (() => {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${ITEST_DB}`;
  return url.toString();
})();
const tsxBin = join(process.cwd(), 'node_modules/.bin/tsx');

const recreateDatabase = async (): Promise<void> => {
  const admin = new pg.Client({ connectionString: baseDatabaseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ITEST_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ITEST_DB}`);
  } finally {
    await admin.end();
  }
  const migrationPool = new pg.Pool({ connectionString: seedDatabaseUrl });
  try {
    await migrateNodePg(drizzleNodePg(migrationPool), { migrationsFolder: 'drizzle' });
  } finally {
    await migrationPool.end();
  }
};

const dropDatabase = async (): Promise<void> => {
  const admin = new pg.Client({ connectionString: baseDatabaseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ITEST_DB} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
};

const runSeed = (): void => {
  const result = spawnSync(tsxBin, ['adapters/db/seed.ts'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: seedDatabaseUrl,
      BETTER_AUTH_SECRET: 'seed-integration-secret-at-least-32-characters',
    },
  });
  expect(result.status, result.stderr).toBe(0);
};

const readDataset = async (client: pg.Client) => {
  const users = await client.query(
    `SELECT id, email, name FROM "user" WHERE email = 'demo@agentproofarch.dev' ORDER BY email`,
  );
  const tenants = await client.query(
    'SELECT id, slug, name FROM tenants ORDER BY id',
  );
  const admins = await client.query(
    'SELECT id, tenant_id, user_id, role FROM tenant_admins ORDER BY id',
  );
  const members = await client.query(
    `SELECT id, tenant_id, user_id, email, display_name, tags,
      marketing_consents #>> '{0,channel}' AS marketing_channel,
      (marketing_consents #>> '{0,granted}')::boolean AS marketing_granted,
      external_customer_ids, last_seen_at IS NULL AS last_seen_is_null
    FROM members ORDER BY id`,
  );
  const domains = await client.query(
    'SELECT id, tenant_id, domain, kind, verified FROM tenant_domains ORDER BY id',
  );
  const todos = await client.query(
    'SELECT id, tenant_id, title, created_by FROM todos ORDER BY id',
  );
  return {
    users: users.rows,
    tenants: tenants.rows,
    admins: admins.rows,
    members: members.rows,
    domains: domains.rows,
    todos: todos.rows,
  };
};

const truncateAfter = async (client: pg.Client, stage: string): Promise<void> => {
  if (stage === 'user') {
    await client.query('DELETE FROM tenants');
    return;
  }
  if (stage === 'tenants') {
    await client.query('DELETE FROM tenant_admins; DELETE FROM members; DELETE FROM tenant_domains; DELETE FROM todos');
    return;
  }
  if (stage === 'tenant-admins') {
    await client.query('DELETE FROM members; DELETE FROM tenant_domains; DELETE FROM todos');
    return;
  }
  if (stage === 'members') {
    await client.query('DELETE FROM tenant_domains; DELETE FROM todos');
    return;
  }
  if (stage === 'tenant-domains') {
    await client.query('DELETE FROM todos');
  }
};

let client: pg.Client;

beforeAll(async () => {
  await recreateDatabase();
  client = new pg.Client({ connectionString: seedDatabaseUrl });
  await client.connect();
}, 60_000);

afterAll(async () => {
  await client.end();
  await dropDatabase();
});

describe('seed convergence', () => {
  it(
    'converges from every stage boundary to one exact idempotent dataset',
    async () => {
      runSeed();
      const expected = await readDataset(client);
      const demoUserId = expected.users[0]?.id;

      expect(expected.users).toEqual([
        {
          id: demoUserId,
          email: 'demo@agentproofarch.dev',
          name: 'Demo User',
        },
      ]);
      expect(expected.tenants).toEqual([
        { id: 'tenant-acme', slug: 'acme', name: 'Acme Sp. z o.o.' },
        { id: 'tenant-globex', slug: 'globex', name: 'Globex Corp' },
      ]);
      expect(expected.admins).toEqual([
        {
          id: 'admin-acme',
          tenant_id: 'tenant-acme',
          user_id: demoUserId,
          role: 'owner',
        },
        {
          id: 'admin-globex',
          tenant_id: 'tenant-globex',
          user_id: demoUserId,
          role: 'admin',
        },
      ]);
      expect(expected.members).toEqual([
        {
          id: 'member-acme-alice',
          tenant_id: 'tenant-acme',
          user_id: 'customer-alice-opaque',
          email: 'alice@example.com',
          display_name: 'Alice Example',
          tags: ['vip', 'early-adopter'],
          marketing_channel: 'email',
          marketing_granted: true,
          external_customer_ids: ['cus_acme_alice'],
          last_seen_is_null: false,
        },
        {
          id: 'member-acme-mag',
          tenant_id: 'tenant-acme',
          user_id: null,
          email: 'mag@example.com',
          display_name: 'Magic Link Member',
          tags: ['provisioned'],
          marketing_channel: null,
          marketing_granted: null,
          external_customer_ids: [],
          last_seen_is_null: true,
        },
        {
          id: 'member-globex-bob',
          tenant_id: 'tenant-globex',
          user_id: 'customer-bob-opaque',
          email: 'bob@example.com',
          display_name: 'Bob Example',
          tags: [],
          marketing_channel: 'email',
          marketing_granted: false,
          external_customer_ids: [],
          last_seen_is_null: true,
        },
      ]);
      expect(expected.domains).toEqual([
        {
          id: 'domain-acme',
          tenant_id: 'tenant-acme',
          domain: 'acme.localhost',
          kind: 'subdomain',
          verified: true,
        },
        {
          id: 'domain-globex',
          tenant_id: 'tenant-globex',
          domain: 'globex.localhost',
          kind: 'subdomain',
          verified: true,
        },
      ]);
      expect(expected.todos).toEqual([
        {
          id: 'todo-globex-architecture',
          tenant_id: 'tenant-globex',
          title: 'Globex: przygotować prezentację architektury',
          created_by: demoUserId,
        },
        {
          id: 'todo-tenant-isolation',
          tenant_id: 'tenant-acme',
          title: 'Sprawdzić izolację danych między tenantami',
          created_by: demoUserId,
        },
        {
          id: 'todo-walking-skeleton',
          tenant_id: 'tenant-acme',
          title: 'Wdrożyć walking skeleton na produkcję',
          created_by: demoUserId,
        },
      ]);

      for (const stage of ['user', 'tenants', 'tenant-admins', 'members', 'tenant-domains']) {
        await truncateAfter(client, stage);
        runSeed();
        expect(await readDataset(client)).toEqual(expected);
      }

      runSeed();
      expect(await readDataset(client)).toEqual(expected);
    },
    30_000,
  );
});
