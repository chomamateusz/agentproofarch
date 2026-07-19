import { describe, expect, it } from 'vitest';

import type { Card, Identity } from '#core/domain/index.js';

import type { CardRepository } from '../ports.js';
import { addCard, listCards, moveCard } from './cards.js';

const identity = (tenantId: string | null): Identity => ({
  userId: 'u1',
  email: 'demo@example.com',
  name: 'Demo',
  tenantId,
  tenantSlug: tenantId ? 'acme' : null,
  tenantName: tenantId ? 'Acme Inc' : null,
  staffRole: tenantId ? 'owner' : null,
  memberId: null,
});

const card = (
  id: string,
  tenantId: string,
  column: string,
  position: number,
  title = id,
): Card => ({ id, tenantId, title, column, position, createdAt: '2026-01-01T00:00:00.000Z' });

const fakeRepo = (initial: Card[] = []) => {
  const store = [...initial];
  const repo: CardRepository = {
    listByTenant: async (tenantId) =>
      store.filter((row) => row.tenantId === tenantId).map((row) => ({ ...row })),
    create: async (row) => {
      store.push(row);
    },
    updatePositions: async (tenantId, updates) => {
      for (const update of updates) {
        const row = store.find((entry) => entry.id === update.id && entry.tenantId === tenantId);
        if (row) {
          row.column = update.column;
          row.position = update.position;
        }
      }
    },
  };
  return { repo, store };
};

const deps = (repo: CardRepository, nextId = 'card-1') => ({
  cards: repo,
  ids: { nextId: () => nextId },
  clock: { nowIso: () => '2026-07-03T00:00:00.000Z' },
});

/** column -> ordered card ids, read back through listCards. */
const layout = async (repo: CardRepository, tenantId: string): Promise<Record<string, string[]>> => {
  const listed = await listCards({ identity: identity(tenantId) }, deps(repo));
  const result: Record<string, string[]> = {};
  if (listed.ok) {
    for (const row of [...listed.value].sort((a, b) => a.position - b.position)) {
      (result[row.column] ??= []).push(row.id);
    }
  }
  return result;
};

describe('cards use-cases — listing + adding', () => {
  it('scopes listing to the tenant in ctx', async () => {
    const { repo } = fakeRepo([card('a', 't-acme', 'todo', 0), card('b', 't-globex', 'todo', 0)]);
    const result = await listCards({ identity: identity('t-acme') }, deps(repo));
    expect(result.ok && result.value.map((row) => row.id)).toEqual(['a']);
  });

  it('refuses to operate without a tenant', async () => {
    const { repo } = fakeRepo();
    expect(await listCards({ identity: identity(null) }, deps(repo))).toMatchObject({
      ok: false,
      error: { code: 'tenant_not_found' },
    });
    expect(
      await addCard({ identity: identity(null) }, { title: 'x', column: 'todo' }, deps(repo)),
    ).toMatchObject({ ok: false, error: { code: 'tenant_not_found' } });
    expect(
      await moveCard(
        { identity: identity(null) },
        { cardId: 'a', toColumn: 'todo', toIndex: 0 },
        deps(repo),
      ),
    ).toMatchObject({ ok: false, error: { code: 'tenant_not_found' } });
  });

  it('validates input and stamps tenant on create', async () => {
    const { repo, store } = fakeRepo();
    const blank = await addCard(
      { identity: identity('t-acme') },
      { title: '  ', column: 'todo' },
      deps(repo),
    );
    expect(blank).toMatchObject({ ok: false, error: { code: 'validation' } });

    const created = await addCard(
      { identity: identity('t-acme') },
      { title: 'Ship it', column: 'todo' },
      deps(repo),
    );
    expect(created).toMatchObject({
      ok: true,
      value: { tenantId: 't-acme', title: 'Ship it', column: 'todo', position: 0 },
    });
    expect(store).toHaveLength(1);
  });

  it('rejects an unknown column with a validation error', async () => {
    const { repo } = fakeRepo();
    expect(
      await addCard({ identity: identity('t-acme') }, { title: 'x', column: 'backlog' }, deps(repo)),
    ).toMatchObject({ ok: false, error: { code: 'validation' } });
  });

  it('appends new cards to the end of their own column', async () => {
    const seed = [
      card('t1', 't-acme', 'todo', 0),
      card('t2', 't-acme', 'todo', 1),
      card('d1', 't-acme', 'doing', 0),
    ];
    const { repo } = fakeRepo(seed);
    const created = await addCard(
      { identity: identity('t-acme') },
      { title: 'third todo', column: 'todo' },
      deps(repo, 'card-new'),
    );
    expect(created).toMatchObject({ ok: true, value: { position: 2, column: 'todo' } });
  });
});

describe('cards use-cases — moveCard', () => {
  const seed = () => [
    card('a', 't-acme', 'todo', 0),
    card('b', 't-acme', 'todo', 1),
    card('c', 't-acme', 'todo', 2),
    card('x', 't-acme', 'doing', 0),
  ];

  it('reorders within a column and rewrites contiguous positions', async () => {
    const { repo } = fakeRepo(seed());
    const result = await moveCard(
      { identity: identity('t-acme') },
      { cardId: 'c', toColumn: 'todo', toIndex: 0 },
      deps(repo),
    );
    expect(result).toMatchObject({ ok: true, value: { id: 'c', column: 'todo', position: 0 } });
    expect(await layout(repo, 't-acme')).toEqual({ todo: ['c', 'a', 'b'], doing: ['x'] });
  });

  it('moves across columns and renumbers both source and target', async () => {
    const { repo } = fakeRepo(seed());
    const result = await moveCard(
      { identity: identity('t-acme') },
      { cardId: 'a', toColumn: 'doing', toIndex: 0 },
      deps(repo),
    );
    expect(result).toMatchObject({ ok: true, value: { id: 'a', column: 'doing', position: 0 } });
    expect(await layout(repo, 't-acme')).toEqual({ todo: ['b', 'c'], doing: ['a', 'x'] });
  });

  it('clamps an out-of-range toIndex to the end of the target column', async () => {
    const { repo } = fakeRepo(seed());
    const result = await moveCard(
      { identity: identity('t-acme') },
      { cardId: 'a', toColumn: 'doing', toIndex: 999 },
      deps(repo),
    );
    // target 'doing' has 1 card after removing none from it; insert clamps to index 1.
    expect(result).toMatchObject({ ok: true, value: { column: 'doing', position: 1 } });
    expect(await layout(repo, 't-acme')).toEqual({ todo: ['b', 'c'], doing: ['x', 'a'] });
  });

  it('clamps a negative toIndex to the front of the target column', async () => {
    const { repo } = fakeRepo(seed());
    const result = await moveCard(
      { identity: identity('t-acme') },
      { cardId: 'b', toColumn: 'todo', toIndex: -5 },
      deps(repo),
    );
    expect(result).toMatchObject({ ok: true, value: { position: 0 } });
    expect(await layout(repo, 't-acme')).toEqual({ todo: ['b', 'a', 'c'], doing: ['x'] });
  });

  it('rejects a move into an unknown column', async () => {
    const { repo } = fakeRepo(seed());
    expect(
      await moveCard(
        { identity: identity('t-acme') },
        { cardId: 'a', toColumn: 'archive', toIndex: 0 },
        deps(repo),
      ),
    ).toMatchObject({ ok: false, error: { code: 'validation' } });
  });

  it('returns not_found for a card the tenant does not own (cross-tenant denial)', async () => {
    const { repo } = fakeRepo([...seed(), card('other', 't-globex', 'todo', 0)]);
    // 'other' exists, but not under t-acme — the tenant-scoped read never sees it.
    const result = await moveCard(
      { identity: identity('t-acme') },
      { cardId: 'other', toColumn: 'doing', toIndex: 0 },
      deps(repo),
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'not_found' } });
    // t-globex's board is untouched by the denied cross-tenant move.
    expect(await layout(repo, 't-globex')).toEqual({ todo: ['other'] });
  });
});
