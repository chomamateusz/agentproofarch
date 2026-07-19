import { assign, setup } from 'xstate';
import {
  type ColumnId,
  type MoveVerdict,
  type TeamBoardState,
  type TeamCard,
  type WipLimits,
} from '../core-contract';

// B2 — the shared machine IS the single source of truth. Columns are states,
// R1–R3 live as guards. Both the client actor and the server-side pure
// transition evaluate THIS artifact; there is no second copy of the rules.
//
// Grill-5 decision-2 hygiene: only domain states (the four columns) appear
// here — no drag/optimism/undo. The one concession is `verdict` in context:
// it is the rule-evaluation OUTPUT (domain), the channel through which a
// targetless (rejected) transition reports which rule fired. It is not a UI
// state. Noted as the borderline call it is.

interface MoveContext {
  readonly column: ColumnId;
  readonly visited: readonly ColumnId[];
  readonly occupancy: Readonly<Record<ColumnId, number>>;
  readonly limits: WipLimits;
  readonly verdict: MoveVerdict;
}

type MoveEvent = { readonly type: 'MOVE'; readonly to: ColumnId };

const countOccupancy = (cards: readonly TeamCard[]): Record<ColumnId, number> => {
  const occupancy = { todo: 0, 'in-dev': 0, review: 0, done: 0 } satisfies Record<
    ColumnId,
    number
  >;
  for (const card of cards) occupancy[card.column] += 1;
  return occupancy;
};

// Reconstructing a per-card context from board-level data is B2's suspected
// weak point: a machine that models ONE card's lifecycle still needs the whole
// board's occupancy + the injected limits to answer R1. So every server check
// rebuilds an entire synthetic context around a single card.
export const buildContext = (
  state: TeamBoardState,
  card: TeamCard,
  limits: WipLimits,
): MoveContext => ({
  column: card.column,
  visited: card.visited,
  occupancy: countOccupancy(state.cards),
  limits,
  verdict: { allowed: true },
});

export const moveMachine = setup({
  types: {
    context: {} as MoveContext,
    events: {} as MoveEvent,
  },
  guards: {
    isIdentity: ({ context, event }) => event.to === context.column,
    // R2: `done` is reachable only from `review`.
    blocksDoneNotFromReview: ({ context, event }) =>
      event.to === 'done' && context.column !== 'review',
    // R3: a card may enter `review` only if it has visited `in-dev`.
    blocksReviewWithoutInDev: ({ context, event }) =>
      event.to === 'review' && !context.visited.includes('in-dev'),
    // R1: a move into a full column is rejected; absent limit = unlimited.
    blocksWip: ({ context, event }) => {
      const limit = context.limits[event.to];
      return limit !== undefined && context.occupancy[event.to] >= limit;
    },
    toTodo: ({ event }) => event.to === 'todo',
    toInDev: ({ event }) => event.to === 'in-dev',
    toReview: ({ event }) => event.to === 'review',
    toDone: ({ event }) => event.to === 'done',
  },
  actions: {
    allow: assign({ verdict: { allowed: true } }),
    commit: assign(({ context, event }) => {
      const occupancy = { ...context.occupancy };
      occupancy[context.column] -= 1;
      occupancy[event.to] += 1;
      return {
        column: event.to,
        visited: context.visited.includes(event.to)
          ? context.visited
          : [...context.visited, event.to],
        occupancy,
        verdict: { allowed: true },
      };
    }),
    rejectDoneOnly: assign({ verdict: { allowed: false, rule: 'done-only-from-review' } }),
    rejectReviewInDev: assign({ verdict: { allowed: false, rule: 'review-requires-in-dev' } }),
    rejectWip: assign({ verdict: { allowed: false, rule: 'wip-limit' } }),
  },
}).createMachine({
  id: 'teamCard',
  initial: 'todo',
  // Reconstructed at runtime via `moveMachine.resolveState`; the literal
  // initial context is only a well-typed placeholder.
  context: {
    column: 'todo',
    visited: ['todo'],
    occupancy: { todo: 0, 'in-dev': 0, review: 0, done: 0 },
    limits: {},
    verdict: { allowed: true },
  },
  // One MOVE handler, reused verbatim by every column-state. Array order IS the
  // grill-5 rejection precedence: identity → done-only → review-in-dev → wip,
  // then the four allow transitions. Exactly one entry fires for any event.to,
  // so `verdict` is always freshly written.
  states: {
    todo: { on: { MOVE: moveTransitions() } },
    'in-dev': { on: { MOVE: moveTransitions() } },
    review: { on: { MOVE: moveTransitions() } },
    done: { on: { MOVE: moveTransitions() } },
  },
});

function moveTransitions() {
  return [
    { guard: 'isIdentity', actions: 'allow' },
    { guard: 'blocksDoneNotFromReview', actions: 'rejectDoneOnly' },
    { guard: 'blocksReviewWithoutInDev', actions: 'rejectReviewInDev' },
    { guard: 'blocksWip', actions: 'rejectWip' },
    { guard: 'toTodo', target: 'todo', actions: 'commit' },
    { guard: 'toInDev', target: 'in-dev', actions: 'commit' },
    { guard: 'toReview', target: 'review', actions: 'commit' },
    { guard: 'toDone', target: 'done', actions: 'commit' },
  ] as const;
}
