import { and, asc, eq } from 'drizzle-orm';

import type { CardRepository } from '#core/server/index.js';

import type { Db } from './client.js';
import { cards } from './schema.js';

export const createCardRepository = (db: Db): CardRepository => ({
  listByTenant: async (tenantId) =>
    db
      .select()
      .from(cards)
      .where(eq(cards.tenantId, tenantId))
      .orderBy(asc(cards.column), asc(cards.position)),
  create: async (card) => {
    await db.insert(cards).values(card);
  },
  // Positions are rewritten row-by-row scoped to the tenant. Sequential (not a
  // db.transaction) so the same code runs under neon-http, which has no
  // interactive transactions; the use-case re-clamps on every read, and the
  // personal board tolerates a transient partial reorder.
  updatePositions: async (tenantId, updates) => {
    for (const update of updates) {
      await db
        .update(cards)
        .set({ column: update.column, position: update.position })
        .where(and(eq(cards.id, update.id), eq(cards.tenantId, tenantId)));
    }
  },
});
