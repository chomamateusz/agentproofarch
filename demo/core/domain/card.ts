import { z } from 'zod';

/**
 * A card is the board-agnostic substrate both boards share. `column` is a plain
 * string here on purpose: the set of legal columns is *data of a board*, not of
 * a card, so the stored shape carries no board's vocabulary and the team board
 * (its own columns + WIP/status rules, a later PR) reuses this exact type and
 * table with zero migration. Each board validates `column` against its own set
 * at the use-case boundary; `position` is a contiguous 0-based index within a
 * column (see the cards use-cases for the index-rewrite repositioning model).
 */
export const cardSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  title: z.string().min(1).max(500),
  column: z.string(),
  position: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export type Card = z.infer<typeof cardSchema>;

export const newCardSchema = z.object({
  title: z.string().trim().min(1, 'Title must not be empty').max(500, 'Title too long'),
  column: z.string(),
});

export type NewCard = z.infer<typeof newCardSchema>;

export const cardMoveSchema = z.object({
  cardId: z.string(),
  toColumn: z.string(),
  toIndex: z.number().int(),
});

export type CardMove = z.infer<typeof cardMoveSchema>;

/**
 * The personal board's column set — free movement, no rules. It lives in
 * `core/domain` (zod-only) because "which columns exist" is a domain fact the
 * server must enforce, not client cosmetics a CLI request could walk past. The
 * team board will add its own set + transition table alongside this one.
 */
export const PERSONAL_BOARD_COLUMNS = ['todo', 'doing', 'done'] as const;

export type PersonalColumn = (typeof PERSONAL_BOARD_COLUMNS)[number];

export const isPersonalColumn = (value: string): value is PersonalColumn =>
  PERSONAL_BOARD_COLUMNS.some((column) => column === value);
