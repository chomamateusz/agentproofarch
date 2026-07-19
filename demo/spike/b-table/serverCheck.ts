import { type MoveCheck } from '../core-contract';
import { buildGuardContext, findCard, guards, transitionTable } from './table';

export const canApplyMove: MoveCheck = (state, move, limits) => {
  const card = findCard(state, move.cardId);
  if (card === undefined) return { allowed: false, rule: 'unknown-card' };
  if (card.column === move.toColumn) return { allowed: true };
  const ctx = buildGuardContext(card, move, state, limits);
  for (const guardId of transitionTable[move.toColumn]) {
    if (!guards[guardId](ctx)) return { allowed: false, rule: guardId };
  }
  return { allowed: true };
};
