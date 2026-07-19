import {
  type ColumnId,
  type RuleId,
  type TeamBoardState,
  type TeamCard,
  type TeamMove,
  type WipLimits,
} from '../core-contract';

export type GuardId = Exclude<RuleId, 'unknown-card'>;

export interface GuardContext {
  readonly from: ColumnId;
  readonly to: ColumnId;
  readonly card: TeamCard;
  readonly board: TeamBoardState;
  readonly limits: WipLimits;
}

export type GuardPredicate = (ctx: GuardContext) => boolean;

export const guards: Readonly<Record<GuardId, GuardPredicate>> = {
  'done-only-from-review': ({ from, to }) => to !== 'done' || from === 'review',
  'review-requires-in-dev': ({ to, card }) => to !== 'review' || card.visited.includes('in-dev'),
  'wip-limit': ({ to, board, card, limits }) => {
    const limit = limits[to];
    if (limit === undefined) return true;
    const occupants = board.cards.filter((c) => c.column === to && c.id !== card.id).length;
    return occupants < limit;
  },
};

export const transitionTable: Readonly<Record<ColumnId, readonly GuardId[]>> = {
  todo: ['wip-limit'],
  'in-dev': ['wip-limit'],
  review: ['review-requires-in-dev', 'wip-limit'],
  done: ['done-only-from-review', 'wip-limit'],
};

export const findCard = (
  board: TeamBoardState,
  cardId: string,
): TeamCard | undefined => board.cards.find((c) => c.id === cardId);

export const buildGuardContext = (
  card: TeamCard,
  move: TeamMove,
  board: TeamBoardState,
  limits: WipLimits,
): GuardContext => ({
  from: card.column,
  to: move.toColumn,
  card,
  board,
  limits,
});
