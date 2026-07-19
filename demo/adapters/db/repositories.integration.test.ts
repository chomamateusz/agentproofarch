import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Identity } from '#core/domain/index.js';
import { addCard, listCards, moveCard } from '#core/server/index.js';

import type { Db } from './client.js';
import { createCardRepository } from './cards-repository.js';
import {
  createHealthPort,
  createTenantAccessReader,
  createTenantDomainRepository,
  createTenantRepository,
  createTodoRepository,
} from './repositories.js';
import { members, tenantAdmins, tenantDomains } from './schema.js';
import * as schema from './schema.js';

const ITEST_DB = 'agentproofarch_itest';
const baseDatabaseUrl =
  process.env['DATABASE_URL'] ??
  'postgresql://agentproofarch:agentproofarch@localhost:47542/agentproofarch';

const itestUrl = (() => {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${ITEST_DB}`;
  return url.toString();
})();

const tenantA = { id: 'itest-tenant-a', slug: 'alpha', name: 'Alpha Inc', createdAt: '2026-01-01T00:00:00.000Z' };
const tenantB = { id: 'itest-tenant-b', slug: 'beta', name: 'Beta LLC', createdAt: '2026-01-01T00:00:00.000Z' };

const staffA = 'itest-staff-a';
const staffB = 'itest-staff-b';
const adminB = 'itest-admin-b';
const custA = 'itest-cust-a';
const custB = 'itest-cust-b';

const todoA1 = {
  id: 'itest-todo-a1',
  tenantId: tenantA.id,
  title: 'Alpha first',
  createdBy: staffA,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const todoA2 = {
  id: 'itest-todo-a2',
  tenantId: tenantA.id,
  title: 'Alpha second',
  createdBy: staffA,
  createdAt: '2026-01-02T00:00:00.000Z',
};
const todoB1 = {
  id: 'itest-todo-b1',
  tenantId: tenantB.id,
  title: 'Beta only',
  createdBy: staffB,
  createdAt: '2026-01-01T12:00:00.000Z',
};

const cardA1 = { id: 'itest-card-a1', tenantId: tenantA.id, title: 'A todo 1', board: 'personal' as const, column: 'todo', position: 0, visited: ['todo'], createdAt: '2026-01-01T00:00:00.000Z' };
const cardA2 = { id: 'itest-card-a2', tenantId: tenantA.id, title: 'A todo 2', board: 'personal' as const, column: 'todo', position: 1, visited: ['todo'], createdAt: '2026-01-02T00:00:00.000Z' };
const cardA3 = { id: 'itest-card-a3', tenantId: tenantA.id, title: 'A doing 1', board: 'personal' as const, column: 'doing', position: 0, visited: ['doing'], createdAt: '2026-01-03T00:00:00.000Z' };
const cardB1 = { id: 'itest-card-b1', tenantId: tenantB.id, title: 'B todo 1', board: 'personal' as const, column: 'todo', position: 0, visited: ['todo'], createdAt: '2026-01-01T00:00:00.000Z' };

let appPool: pg.Pool;
let db: Db;

const todoRepo = () => createTodoRepository(db);
const cardRepo = () => createCardRepository(db);
const domainRepo = () => createTenantDomainRepository(db);
const tenantRepo = () => createTenantRepository(db);
const accessReader = () => createTenantAccessReader(db);

const createIsolatedDatabase = async (): Promise<void> => {
  const admin = new pg.Client({ connectionString: baseDatabaseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ITEST_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ITEST_DB}`);
  } finally {
    await admin.end();
  }
};

const dropIsolatedDatabase = async (): Promise<void> => {
  const admin = new pg.Client({ connectionString: baseDatabaseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ITEST_DB} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
};

const runMigrations = async (): Promise<void> => {
  const migrationPool = new pg.Pool({ connectionString: itestUrl });
  try {
    await migrateNodePg(drizzleNodePg(migrationPool), { migrationsFolder: 'drizzle' });
  } finally {
    await migrationPool.end();
  }
};

const seed = async (): Promise<void> => {
  await tenantRepo().createTenant(tenantA);
  await tenantRepo().createTenant(tenantB);

  await tenantRepo().createOwnerGrant({
    id: 'itest-grant-a',
    tenantId: tenantA.id,
    userId: staffA,
    staffRole: 'owner',
  });
  await tenantRepo().createOwnerGrant({
    id: 'itest-grant-b',
    tenantId: tenantB.id,
    userId: staffB,
    staffRole: 'owner',
  });
  // An 'admin' grant on B — proves the non-owner role round-trips and stays scoped.
  await db.insert(tenantAdmins).values({
    id: 'itest-grant-b-admin',
    tenantId: tenantB.id,
    userId: adminB,
    role: 'admin',
  });

  await db.insert(members).values([
    {
      id: 'itest-member-a',
      tenantId: tenantA.id,
      userId: custA,
      email: 'cust-a@example.com',
      displayName: 'Customer A',
      createdAt: tenantA.createdAt,
    },
    {
      id: 'itest-member-b',
      tenantId: tenantB.id,
      userId: custB,
      email: 'cust-b@example.com',
      displayName: null,
      createdAt: tenantB.createdAt,
    },
  ]);

  await db.insert(tenantDomains).values([
    { id: 'itest-domain-a', tenantId: tenantA.id, domain: 'alpha.localhost', kind: 'subdomain', verified: true },
    { id: 'itest-domain-b', tenantId: tenantB.id, domain: 'beta.localhost', kind: 'subdomain', verified: true },
    {
      id: 'itest-domain-unverified',
      tenantId: tenantA.id,
      domain: 'unverified.localhost',
      kind: 'custom',
      verified: false,
    },
  ]);

  await todoRepo().create(todoA1);
  await todoRepo().create(todoA2);
  await todoRepo().create(todoB1);

  await cardRepo().create(cardA1);
  await cardRepo().create(cardA2);
  await cardRepo().create(cardA3);
  await cardRepo().create(cardB1);
};

beforeAll(async () => {
  await createIsolatedDatabase();
  await runMigrations();
  appPool = new pg.Pool({ connectionString: itestUrl });
  db = drizzleNodePg(appPool, { schema });
  await seed();
}, 60_000);

afterAll(async () => {
  await appPool.end();
  await dropIsolatedDatabase();
});

describe('HealthPort', () => {
  it('pings a reachable database', async () => {
    expect(await createHealthPort(db).pingDatabase()).toBe(true);
  });

  it('reports false when the database is unreachable', async () => {
    const brokenPool = new pg.Pool({
      connectionString: 'postgresql://nobody:nobody@localhost:47542/agentproofarch_does_not_exist',
    });
    brokenPool.on('error', () => {});
    try {
      const health = createHealthPort(drizzleNodePg(brokenPool, { schema }));
      expect(await health.pingDatabase()).toBe(false);
    } finally {
      await brokenPool.end();
    }
  });
});

describe('TenantRepository', () => {
  it('createTenant returns the created tenant and is read back by id and slug', async () => {
    const fresh = {
      id: 'itest-tenant-c',
      slug: 'gamma',
      name: 'Gamma GmbH',
      createdAt: '2026-02-01T00:00:00.000Z',
    };
    const created = await tenantRepo().createTenant(fresh);
    expect(created).toEqual({ id: fresh.id, slug: fresh.slug, name: fresh.name });

    expect(await tenantRepo().findById(fresh.id)).toMatchObject({
      id: fresh.id,
      slug: fresh.slug,
      name: fresh.name,
    });
    expect(await tenantRepo().findBySlug(fresh.slug)).toMatchObject({ id: fresh.id });
  });

  it('findById and findBySlug return null for unknown tenants', async () => {
    expect(await tenantRepo().findById('itest-tenant-missing')).toBeNull();
    expect(await tenantRepo().findBySlug('missing-slug')).toBeNull();
  });

  it('createOwnerGrant makes the tenant readable as an owner grant', async () => {
    const fresh = {
      id: 'itest-tenant-d',
      slug: 'delta',
      name: 'Delta Co',
      createdAt: '2026-02-02T00:00:00.000Z',
    };
    await tenantRepo().createTenant(fresh);
    const userD = 'itest-staff-d';
    await tenantRepo().createOwnerGrant({
      id: 'itest-grant-d',
      tenantId: fresh.id,
      userId: userD,
      staffRole: 'owner',
    });
    expect(await accessReader().findStaffGrant(userD, { tenantId: fresh.id })).toEqual({
      tenant: { id: fresh.id, slug: fresh.slug, name: fresh.name },
      staffRole: 'owner',
    });
  });
});

describe('TodoRepository', () => {
  it('lists a tenant todos ordered by createdAt', async () => {
    const rows = await todoRepo().listByTenant(tenantA.id);
    expect(rows).toEqual([todoA1, todoA2]);
  });

  it('create inserts a todo visible only within its tenant', async () => {
    const extra = {
      id: 'itest-todo-a3',
      tenantId: tenantA.id,
      title: 'Alpha third',
      createdBy: staffA,
      createdAt: '2026-01-03T00:00:00.000Z',
    };
    await todoRepo().create(extra);
    const aIds = (await todoRepo().listByTenant(tenantA.id)).map((t) => t.id);
    expect(aIds).toContain(extra.id);
    const bIds = (await todoRepo().listByTenant(tenantB.id)).map((t) => t.id);
    expect(bIds).not.toContain(extra.id);
  });
});

describe('CardRepository', () => {
  it('lists a tenant cards ordered by column then position', async () => {
    const rows = await cardRepo().listByTenant(tenantA.id, 'personal');
    expect(rows.map((c) => c.id)).toEqual([cardA3.id, cardA1.id, cardA2.id]);
  });

  it('create inserts a card visible only within its tenant', async () => {
    const extra = { id: 'itest-card-a4', tenantId: tenantA.id, title: 'A doing 2', board: 'personal' as const, column: 'doing', position: 1, visited: ['doing'], createdAt: '2026-01-04T00:00:00.000Z' };
    await cardRepo().create(extra);
    const aIds = (await cardRepo().listByTenant(tenantA.id, 'personal')).map((c) => c.id);
    expect(aIds).toContain(extra.id);
    const bIds = (await cardRepo().listByTenant(tenantB.id, 'personal')).map((c) => c.id);
    expect(bIds).not.toContain(extra.id);
  });

  it('updatePositions rewrites column + position for the tenant rows', async () => {
    // Move cardA2 to the front of doing, renumber both columns contiguously.
    await cardRepo().updatePositions(tenantA.id, 'personal', [
      { id: cardA2.id, column: 'doing', position: 0 },
      { id: cardA3.id, column: 'doing', position: 1 },
      { id: cardA1.id, column: 'todo', position: 0 },
    ]);
    const byId = new Map((await cardRepo().listByTenant(tenantA.id, 'personal')).map((c) => [c.id, c]));
    expect(byId.get(cardA2.id)).toMatchObject({ column: 'doing', position: 0 });
    expect(byId.get(cardA3.id)).toMatchObject({ column: 'doing', position: 1 });
    expect(byId.get(cardA1.id)).toMatchObject({ column: 'todo', position: 0 });
  });

  it('updatePositions is tenant-scoped: another tenant cannot renumber these cards', async () => {
    const before = (await cardRepo().listByTenant(tenantB.id, 'personal')).find((c) => c.id === cardB1.id);
    // tenantA attempts to move tenantB's card — the id/tenant guard makes it a no-op.
    await cardRepo().updatePositions(tenantA.id, 'personal', [{ id: cardB1.id, column: 'done', position: 9 }]);
    const after = (await cardRepo().listByTenant(tenantB.id, 'personal')).find((c) => c.id === cardB1.id);
    expect(after).toEqual(before);
  });
});

describe('TenantDomainRepository', () => {
  it('findByDomain returns only verified domains', async () => {
    expect(await domainRepo().findByDomain('alpha.localhost')).toMatchObject({
      tenantId: tenantA.id,
      verified: true,
    });
    expect(await domainRepo().findByDomain('unverified.localhost')).toBeNull();
    expect(await domainRepo().findByDomain('nope.localhost')).toBeNull();
  });

  it('listVerifiedDomains excludes unverified domains', async () => {
    const domains = await domainRepo().listVerifiedDomains();
    expect(domains.every((d) => d.verified)).toBe(true);
    const domainNames = domains.map((d) => d.domain);
    expect(domainNames).toEqual(expect.arrayContaining(['alpha.localhost', 'beta.localhost']));
    expect(domainNames).not.toContain('unverified.localhost');
  });
});

describe('TenantAccessReader', () => {
  it('listTenantsForStaff returns memberships scoped to the staff user', async () => {
    const memberships = await accessReader().listTenantsForStaff(staffA);
    expect(memberships).toEqual([
      { tenant: { id: tenantA.id, slug: tenantA.slug, name: tenantA.name }, staffRole: 'owner' },
    ]);
  });

  it('findStaffGrant resolves by tenant id and by slug', async () => {
    expect(await accessReader().findStaffGrant(staffA, { tenantId: tenantA.id })).toMatchObject({
      staffRole: 'owner',
    });
    expect(await accessReader().findStaffGrant(staffA, { tenantSlug: tenantA.slug })).toMatchObject({
      tenant: { id: tenantA.id },
    });
  });

  it('findStaffGrant reads a non-owner (admin) role', async () => {
    expect(await accessReader().findStaffGrant(adminB, { tenantId: tenantB.id })).toEqual({
      tenant: { id: tenantB.id, slug: tenantB.slug, name: tenantB.name },
      staffRole: 'admin',
    });
  });

  it('findMember returns the member row for the tenant', async () => {
    expect(await accessReader().findMember(custA, tenantA.id)).toMatchObject({
      id: 'itest-member-a',
      tenantId: tenantA.id,
      userId: custA,
    });
  });
});

describe('tenant isolation invariant', () => {
  it('listByTenant never returns another tenant rows', async () => {
    const aTodos = await todoRepo().listByTenant(tenantA.id);
    expect(aTodos.every((t) => t.tenantId === tenantA.id)).toBe(true);
    expect(aTodos.map((t) => t.id)).not.toContain(todoB1.id);

    const bTodos = await todoRepo().listByTenant(tenantB.id);
    expect(bTodos.every((t) => t.tenantId === tenantB.id)).toBe(true);
    expect(bTodos.map((t) => t.id)).toEqual([todoB1.id]);
  });

  it('cards never leak across tenants', async () => {
    const aCards = await cardRepo().listByTenant(tenantA.id, 'personal');
    expect(aCards.every((c) => c.tenantId === tenantA.id)).toBe(true);
    expect(aCards.map((c) => c.id)).not.toContain(cardB1.id);

    const bCards = await cardRepo().listByTenant(tenantB.id, 'personal');
    expect(bCards.every((c) => c.tenantId === tenantB.id)).toBe(true);
    expect(bCards.map((c) => c.id)).toContain(cardB1.id);
  });

  it('findMember is scoped to the tenant and cannot cross tenants', async () => {
    expect(await accessReader().findMember(custA, tenantB.id)).toBeNull();
    expect(await accessReader().findMember(custB, tenantA.id)).toBeNull();
  });

  it('listTenantsForStaff never leaks another staff grants', async () => {
    const aMemberships = await accessReader().listTenantsForStaff(staffA);
    expect(aMemberships.map((m) => m.tenant.id)).not.toContain(tenantB.id);
    const bMemberships = await accessReader().listTenantsForStaff(staffB);
    expect(bMemberships.map((m) => m.tenant.id)).not.toContain(tenantA.id);
  });

  it('findStaffGrant refuses grants outside the staff and tenant scope', async () => {
    expect(await accessReader().findStaffGrant(staffA, { tenantId: tenantB.id })).toBeNull();
    expect(await accessReader().findStaffGrant(staffA, { tenantSlug: tenantB.slug })).toBeNull();
    expect(await accessReader().findStaffGrant(staffB, { tenantId: tenantA.id })).toBeNull();
  });
});

describe('team board rules against Postgres', () => {
  const identityA: Identity = {
    userId: staffA,
    email: 'staff-a@example.com',
    name: 'Staff A',
    tenantId: tenantA.id,
    tenantSlug: tenantA.slug,
    tenantName: tenantA.name,
    staffRole: 'owner',
    memberId: null,
  };
  const ctx = { identity: identityA };
  const teamDeps = () => ({
    cards: cardRepo(),
    ids: { nextId: () => `itest-team-${crypto.randomUUID()}` },
    clock: { nowIso: () => '2026-03-01T00:00:00.000Z' },
  });

  it('cross-board isolation: the personal list never shows team cards', async () => {
    const teamCard = {
      id: 'itest-team-iso',
      tenantId: tenantA.id,
      title: 'Team iso',
      board: 'team' as const,
      column: 'todo',
      position: 0,
      visited: ['todo'],
      createdAt: '2026-03-01T00:00:00.000Z',
    };
    await cardRepo().create(teamCard);

    const personal = await cardRepo().listByTenant(tenantA.id, 'personal');
    expect(personal.map((c) => c.id)).not.toContain(teamCard.id);
    expect(personal.every((c) => c.board === 'personal')).toBe(true);

    const team = await cardRepo().listByTenant(tenantA.id, 'team');
    expect(team.map((c) => c.id)).toContain(teamCard.id);
    expect(team.every((c) => c.board === 'team')).toBe(true);
  });

  it('drives the guarded path and round-trips visited history through jsonb', async () => {
    const created = await addCard(ctx, { title: 'Guarded task', board: 'team', column: 'todo' }, teamDeps());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.id;
    expect(created.value.visited).toEqual(['todo']);

    // review before in-dev is rejected with its rule, and persists nothing.
    const early = await moveCard(ctx, { cardId: id, board: 'team', toColumn: 'review', toIndex: 0 }, teamDeps());
    expect(early).toMatchObject({
      ok: false,
      error: { code: 'validation', details: { rule: 'review-requires-in-dev' } },
    });
    const afterReject = (await cardRepo().listByTenant(tenantA.id, 'team')).find((c) => c.id === id);
    expect(afterReject).toMatchObject({ column: 'todo', visited: ['todo'] });

    // The legal path advances the card and grows visited, round-tripped through PG.
    for (const toColumn of ['in-dev', 'review', 'done']) {
      const step = await moveCard(ctx, { cardId: id, board: 'team', toColumn, toIndex: 0 }, teamDeps());
      expect(step.ok).toBe(true);
    }
    const settled = (await cardRepo().listByTenant(tenantA.id, 'team')).find((c) => c.id === id);
    expect(settled).toMatchObject({ column: 'done' });
    expect(settled?.visited).toEqual(['todo', 'in-dev', 'review', 'done']);
  });

  it('enforces the WIP limit against real rows', async () => {
    // in-dev limit is 3: seed three occupants, a fourth move is rejected.
    for (let i = 0; i < 3; i += 1) {
      await cardRepo().create({
        id: `itest-team-wip-${i}`,
        tenantId: tenantA.id,
        title: `WIP ${i}`,
        board: 'team' as const,
        column: 'in-dev',
        position: i,
        visited: ['todo', 'in-dev'],
        createdAt: '2026-03-01T00:00:00.000Z',
      });
    }
    const created = await addCard(ctx, { title: 'Fourth', board: 'team', column: 'todo' }, teamDeps());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const blocked = await moveCard(
      ctx,
      { cardId: created.value.id, board: 'team', toColumn: 'in-dev', toIndex: 0 },
      teamDeps(),
    );
    expect(blocked).toMatchObject({
      ok: false,
      error: { code: 'validation', details: { rule: 'wip-limit' } },
    });
  });

  it('listCards use-case is board-scoped end to end', async () => {
    const personal = await listCards(ctx, { board: 'personal' }, teamDeps());
    expect(personal.ok && personal.value.every((c) => c.board === 'personal')).toBe(true);
    const team = await listCards(ctx, { board: 'team' }, teamDeps());
    expect(team.ok && team.value.every((c) => c.board === 'team')).toBe(true);
  });
});
