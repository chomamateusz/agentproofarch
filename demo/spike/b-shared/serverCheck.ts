import { getNextSnapshot } from 'xstate';
import { type MoveCheck } from '../core-contract';
import { buildContext, moveMachine } from './machine';

// Server-side enforcement: no long-lived actor. Reconstruct a snapshot at the
// card's current column, push one MOVE through the pure transition API, read
// the verdict the SAME machine wrote. `unknown-card` is the only rule decided
// outside the machine — a card that does not exist has no column to resolve to.
export const canApplyMove: MoveCheck = (state, move, limits) => {
  const card = state.cards.find((candidate) => candidate.id === move.cardId);
  if (card === undefined) return { allowed: false, rule: 'unknown-card' };

  const snapshot = moveMachine.resolveState({
    value: card.column,
    context: buildContext(state, card, limits),
  });
  const next = getNextSnapshot(moveMachine, snapshot, { type: 'MOVE', to: move.toColumn });
  return next.context.verdict;
};
