import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { cardSchema } from '#core/domain/index.js';
import type { CardRepository } from '#core/server/index.js';

import type { Db } from './client.js';
import { cards } from './schema.js';

export const createCardRepository = (db: Db): CardRepository => ({
  // Parse at the boundary (C3 invariant matrix): a corrupted card row (an
  // out-of-range position, a non-board value the DB check somehow missed) is
  // rejected LOUDLY here rather than flowing untyped into the use-cases.
  listByTenant: async (tenantId, board) => {
    const rows = await db
      .select()
      .from(cards)
      .where(and(eq(cards.tenantId, tenantId), eq(cards.board, board)))
      .orderBy(asc(cards.column), asc(cards.position));
    return rows.map((row) => cardSchema.parse(row));
  },
  create: async (card) => {
    await db.insert(cards).values(card);
  },
  updatePositions: async (tenantId, board, updates, expected) => {
    if (updates.length === 0) return true;
    const snapshot = Object.fromEntries(
      expected.map((card) => [card.id, [card.column, card.position, card.visited]]),
    );
    // Compare the locked rows: an unlocked subquery could retain the pre-wait
    // statement snapshot and approve a stale move.
    const result = await db.execute(sql`
      WITH locked_cards AS MATERIALIZED (
        SELECT id, "column", position, visited FROM cards
        WHERE tenant_id = ${tenantId} AND board = ${board}
        ORDER BY id
        FOR UPDATE
      )
      UPDATE cards AS target
      SET "column" = changes."column", position = changes.position,
          visited = COALESCE(changes.visited, target.visited)
      FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb)
        AS changes(id text, "column" text, position integer, visited jsonb)
      WHERE target.id = changes.id AND target.tenant_id = ${tenantId} AND target.board = ${board}
        AND (SELECT COALESCE(jsonb_object_agg(id, jsonb_build_array("column", position, visited)), '{}'::jsonb)
             FROM locked_cards) = ${JSON.stringify(snapshot)}::jsonb
      RETURNING target.id
    `);
    const rows = z.union([
      z.array(z.object({ id: z.string() })),
      z.object({ rows: z.array(z.object({ id: z.string() })) }).transform((value) => value.rows),
    ]).parse(result);
    return rows.length === updates.length;
  },
});
