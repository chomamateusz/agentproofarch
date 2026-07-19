import {
  cardMoveSchema,
  err,
  isPersonalColumn,
  newCardSchema,
  notFound,
  ok,
  tenantNotFound,
  validation,
  type AppError,
  type Card,
  type CardMove,
  type NewCard,
  type Result,
} from '#core/domain/index.js';

import type { Ctx } from '../context.js';
import type { CardPositionUpdate, CardRepository, Clock, IdGenerator } from '../ports.js';

export interface CardDeps {
  cards: CardRepository;
  ids: IdGenerator;
  clock: Clock;
}

const byPosition = (a: Card, b: Card): number => a.position - b.position;

export const listCards = async (ctx: Ctx, deps: CardDeps): Promise<Result<Card[], AppError>> => {
  if (!ctx.identity.tenantId) return err(tenantNotFound('Select a tenant to list cards'));
  return ok(await deps.cards.listByTenant(ctx.identity.tenantId));
};

export const addCard = async (
  ctx: Ctx,
  input: NewCard,
  deps: CardDeps,
): Promise<Result<Card, AppError>> => {
  if (!ctx.identity.tenantId) return err(tenantNotFound('Select a tenant to add cards'));

  const parsed = newCardSchema.safeParse(input);
  if (!parsed.success) return err(validation('Invalid card', parsed.error.flatten()));
  if (!isPersonalColumn(parsed.data.column)) {
    return err(validation(`Unknown column "${parsed.data.column}"`));
  }

  const existing = await deps.cards.listByTenant(ctx.identity.tenantId);
  const position = existing.filter((card) => card.column === parsed.data.column).length;

  const card: Card = {
    id: deps.ids.nextId(),
    tenantId: ctx.identity.tenantId,
    title: parsed.data.title,
    column: parsed.data.column,
    position,
    createdAt: deps.clock.nowIso(),
  };
  await deps.cards.create(card);
  return ok(card);
};

/**
 * Free movement, no rules: any card to any column at any index. Positions are
 * rewritten as contiguous 0-based indices (not fractional) — deterministic, no
 * precision drift, and the clamp target is simply the column length. `toIndex`
 * is clamped into the valid range HERE, before persistence (ADR-0005
 * spike-learning: clamp raw payload indices at the gateway, never trust the
 * client's optimistic index), so persisted order can never diverge.
 */
export const moveCard = async (
  ctx: Ctx,
  input: CardMove,
  deps: CardDeps,
): Promise<Result<Card, AppError>> => {
  if (!ctx.identity.tenantId) return err(tenantNotFound('Select a tenant to move cards'));

  const parsed = cardMoveSchema.safeParse(input);
  if (!parsed.success) return err(validation('Invalid move', parsed.error.flatten()));
  const { cardId, toColumn, toIndex } = parsed.data;
  if (!isPersonalColumn(toColumn)) return err(validation(`Unknown column "${toColumn}"`));

  const tenantId = ctx.identity.tenantId;
  const all = await deps.cards.listByTenant(tenantId);
  const moving = all.find((card) => card.id === cardId);
  if (!moving) return err(notFound(`Card ${cardId} not found`));

  const target = all
    .filter((card) => card.column === toColumn && card.id !== cardId)
    .sort(byPosition);
  const clampedIndex = Math.max(0, Math.min(toIndex, target.length));
  const moved: Card = { ...moving, column: toColumn, position: clampedIndex };
  target.splice(clampedIndex, 0, moved);

  const updates: CardPositionUpdate[] = target.map((card, index) => ({
    id: card.id,
    column: toColumn,
    position: index,
  }));

  if (moving.column !== toColumn) {
    all
      .filter((card) => card.column === moving.column && card.id !== cardId)
      .sort(byPosition)
      .forEach((card, index) => {
        updates.push({ id: card.id, column: moving.column, position: index });
      });
  }

  await deps.cards.updatePositions(tenantId, updates);
  return ok(moved);
};
