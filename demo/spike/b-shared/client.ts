import { type Actor, createActor } from 'xstate';
import { type MoveCheck, type TeamBoardState, type TeamCard, type WipLimits } from '../core-contract';
import { buildContext, moveMachine } from './machine';

// Thin island-core wrapper around the SAME machine. A live actor is rehydrated
// at the card's column (drag UX would keep this actor around and subscribe to
// its snapshot for the blocked-drop reason); the server uses a pure transition.
// Two different invocation styles, one artifact.
export const spawnCardActor = (
  state: TeamBoardState,
  card: TeamCard,
  limits: WipLimits,
): Actor<typeof moveMachine> => {
  const snapshot = moveMachine.resolveState({
    value: card.column,
    context: buildContext(state, card, limits),
  });
  return createActor(moveMachine, { snapshot });
};

// MoveCheck-shaped adapter so the drift test can compare client vs server on
// identical inputs. Goes through a real running actor (send + read snapshot),
// NOT the pure API the server uses — that is what makes the drift test's
// equality non-trivial rather than `x === x`.
export const canApplyMove: MoveCheck = (state, move, limits) => {
  const card = state.cards.find((candidate) => candidate.id === move.cardId);
  if (card === undefined) return { allowed: false, rule: 'unknown-card' };

  const actor = spawnCardActor(state, card, limits).start();
  actor.send({ type: 'MOVE', to: move.toColumn });
  const { verdict } = actor.getSnapshot().context;
  actor.stop();
  return verdict;
};
