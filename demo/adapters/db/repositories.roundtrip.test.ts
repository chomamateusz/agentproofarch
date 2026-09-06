import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createCardRepository } from './cards-repository.js';
import type { Db } from './client.js';
import { createTenantRepository } from './repositories.js';
import * as schema from './schema.js';

/**
 * C1 atomicity proof (§Transactions): `createTenantWithOwner` must reach the
 * driver in exactly ONE round-trip so tenant + owner are inserted atomically.
 * We wrap a real drizzle db, stub `execute` (never connecting) and assert it is
 * called exactly once — a regression that splits the CTE into two statements, or
 * reverts to two `insert()` calls, makes this count wrong and fails the gate.
 */

const pool = new pg.Pool({ connectionString: 'postgresql://probe:probe@127.0.0.1:1/probe' });
const db = drizzleNodePg(pool, { schema });

afterAll(async () => {
  await pool.end();
});

describe('createTenantWithOwner atomicity', () => {
  it('reaches the driver in a single execute() round-trip', async () => {
    const execute = vi
      .spyOn(db, 'execute')
      .mockResolvedValue({ command: 'INSERT', rowCount: 1, oid: 0, rows: [], fields: [] });

    const repo = createTenantRepository(db);
    const tenant = await repo.createTenantWithOwner({
      tenant: { id: 't-1', slug: 'acme', name: 'Acme', createdAt: '2026-07-21T00:00:00.000Z' },
      ownerGrant: { id: 'g-1', userId: 'u-1' },
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(tenant).toEqual({ id: 't-1', slug: 'acme', name: 'Acme' });
  });
});

describe('card move atomicity', () => {
  const expected = [{
    id: 'c-1', tenantId: 't-1', board: 'personal' as const, title: 'Card',
    column: 'todo', position: 0, visited: ['todo'], createdAt: '2026-07-21T00:00:00.000Z',
  }];
  const updates = [{ id: 'c-1', column: 'doing', position: 0, visited: ['todo', 'doing'] }];

  it.each([
    { driver: 'node-postgres', result: { rows: [{ id: 'c-1' }] }, applied: true },
    { driver: 'neon-http', result: [{ id: 'c-1' }], applied: true },
    { driver: 'node-postgres conflict', result: { rows: [] }, applied: false },
    { driver: 'neon-http conflict', result: [], applied: false },
  ])('uses one execute and reads the $driver result', async ({ result, applied }) => {
    const cardDb: Db = db;
    const execute = vi.spyOn(cardDb, 'execute').mockResolvedValue(result);
    execute.mockClear();

    expect(await createCardRepository(cardDb).updatePositions('t-1', 'personal', updates, expected))
      .toBe(applied);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not issue a statement for an empty update', async () => {
    const execute = vi.spyOn(db, 'execute');
    execute.mockClear();
    expect(await createCardRepository(db).updatePositions('t-1', 'personal', [], expected)).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it('propagates driver failures', async () => {
    const failure = new Error('connection lost');
    vi.spyOn(db, 'execute').mockRejectedValueOnce(failure);
    await expect(createCardRepository(db).updatePositions('t-1', 'personal', updates, expected))
      .rejects.toBe(failure);
  });
});
