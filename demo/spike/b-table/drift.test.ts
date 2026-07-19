import { and, assign, getNextSnapshot, setup } from 'xstate';
import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  type ColumnId,
  type MoveVerdict,
  type RuleId,
  type TeamBoardState,
  type TeamCard,
  type TeamMove,
  type WipLimits,
} from '../core-contract';
import { evaluateMove } from './machine';
import { canApplyMove } from './serverCheck';
import { buildGuardContext, findCard, type GuardId, guards } from './table';

const visitedReps = (col: ColumnId): readonly (readonly ColumnId[])[] => {
  const withInDev: readonly ColumnId[] = Array.from(new Set<ColumnId>(['in-dev', col]));
  if (col === 'in-dev') return [withInDev];
  return [withInDev, [col]];
};

const boards: readonly TeamBoardState[] = [
  ...COLUMNS.flatMap((col) =>
    visitedReps(col).map((visited): TeamBoardState => ({
      cards: [{ id: 'c1', title: 'C1', column: col, visited }],
    })),
  ),
  ...COLUMNS.flatMap((occCol) => {
    const occVisited = visitedReps(occCol)[0];
    if (occVisited === undefined) return [];
    const occupant: TeamCard = { id: 'occ', title: 'Occ', column: occCol, visited: occVisited };
    return COLUMNS.flatMap((movCol) =>
      visitedReps(movCol).map((visited): TeamBoardState => ({
        cards: [occupant, { id: 'c1', title: 'C1', column: movCol, visited }],
      })),
    );
  }),
];

const limitOptions: readonly WipLimits[] = [{}, { 'in-dev': 1 }, { review: 1 }];

const movesFor = (board: TeamBoardState): readonly TeamMove[] => [
  ...board.cards.flatMap((card) => COLUMNS.map((toColumn): TeamMove => ({ cardId: card.id, toColumn }))),
  { cardId: 'ghost', toColumn: 'done' },
];

interface Scenario {
  readonly board: TeamBoardState;
  readonly move: TeamMove;
  readonly limits: WipLimits;
}

const scenarios: readonly Scenario[] = boards.flatMap((board) =>
  limitOptions.flatMap((limits) => movesFor(board).map((move): Scenario => ({ board, move, limits }))),
);

// A deliberately DRIFTED, hand-written machine: it reuses the shared guard
// predicates (so the drift is not a logic fork) but the review transitions are
// hand-wired WITHOUT the `review-requires-in-dev` guard — the classic "someone
// forgot to bind a guard" divergence between the two enforcement sites.
interface DriftContext {
  readonly cardId: string;
  readonly board: TeamBoardState;
  readonly limits: WipLimits;
  readonly verdict: MoveVerdict | null;
}
type DriftEvent =
  | { readonly type: 'MOVE_TO_TODO' }
  | { readonly type: 'MOVE_TO_IN_DEV' }
  | { readonly type: 'MOVE_TO_REVIEW' }
  | { readonly type: 'MOVE_TO_DONE' };

const driftEventByColumn: Readonly<Record<ColumnId, DriftEvent>> = {
  todo: { type: 'MOVE_TO_TODO' },
  'in-dev': { type: 'MOVE_TO_IN_DEV' },
  review: { type: 'MOVE_TO_REVIEW' },
  done: { type: 'MOVE_TO_DONE' },
};
const driftColumnByEvent: Readonly<Record<DriftEvent['type'], ColumnId>> = {
  MOVE_TO_TODO: 'todo',
  MOVE_TO_IN_DEV: 'in-dev',
  MOVE_TO_REVIEW: 'review',
  MOVE_TO_DONE: 'done',
};
const driftCtx: DriftContext = { cardId: '', board: { cards: [] }, limits: {}, verdict: null };

const driftHolds = (guardId: GuardId, context: DriftContext, event: DriftEvent): boolean => {
  const card = findCard(context.board, context.cardId);
  if (card === undefined) return false;
  const move: TeamMove = { cardId: context.cardId, toColumn: driftColumnByEvent[event.type] };
  return guards[guardId](buildGuardContext(card, move, context.board, context.limits));
};

const driftFactory = setup({
  types: { context: driftCtx, events: driftEventByColumn.todo },
  guards: {
    passes: ({ context, event }, params: { readonly guardId: GuardId }) =>
      driftHolds(params.guardId, context, event),
    fails: ({ context, event }, params: { readonly guardId: GuardId }) =>
      !driftHolds(params.guardId, context, event),
  },
  actions: {
    mark: assign((_a, params: { readonly verdict: MoveVerdict }) => ({ verdict: params.verdict })),
  },
});
// Hand-written INLINE (hoisting these transitions into helper consts widened
// their literal types — `target: string`, `allowed: boolean` — and XState's
// config type rejected them; a second face of the same inference friction).
// The planted fault: every `MOVE_TO_REVIEW` below is wired with the wip guard
// ONLY, dropping `review-requires-in-dev`.
const allow = { type: 'mark' as const, params: { verdict: { allowed: true as const } } };
const wipOk = { type: 'passes' as const, params: { guardId: 'wip-limit' as const } };
const wipNo = {
  guard: { type: 'fails' as const, params: { guardId: 'wip-limit' as const } },
  actions: { type: 'mark' as const, params: { verdict: { allowed: false as const, rule: 'wip-limit' as const } } },
};

const driftedMachine = driftFactory.createMachine({
  initial: 'todo',
  context: driftCtx,
  states: {
    todo: {
      on: {
        MOVE_TO_TODO: { target: 'todo', actions: allow },
        MOVE_TO_IN_DEV: [{ target: 'in-dev', guard: wipOk, actions: allow }, wipNo],
        MOVE_TO_REVIEW: [{ target: 'review', guard: wipOk, actions: allow }, wipNo],
        MOVE_TO_DONE: [
          { target: 'done', guard: and([{ type: 'passes', params: { guardId: 'done-only-from-review' as const } }, wipOk]), actions: allow },
          { guard: { type: 'fails', params: { guardId: 'done-only-from-review' } }, actions: { type: 'mark', params: { verdict: { allowed: false, rule: 'done-only-from-review' } } } },
          wipNo,
        ],
      },
    },
    'in-dev': {
      on: {
        MOVE_TO_TODO: [{ target: 'todo', guard: wipOk, actions: allow }, wipNo],
        MOVE_TO_IN_DEV: { target: 'in-dev', actions: allow },
        MOVE_TO_REVIEW: [{ target: 'review', guard: wipOk, actions: allow }, wipNo],
        MOVE_TO_DONE: [
          { target: 'done', guard: and([{ type: 'passes', params: { guardId: 'done-only-from-review' as const } }, wipOk]), actions: allow },
          { guard: { type: 'fails', params: { guardId: 'done-only-from-review' } }, actions: { type: 'mark', params: { verdict: { allowed: false, rule: 'done-only-from-review' } } } },
          wipNo,
        ],
      },
    },
    review: {
      on: {
        MOVE_TO_TODO: [{ target: 'todo', guard: wipOk, actions: allow }, wipNo],
        MOVE_TO_IN_DEV: [{ target: 'in-dev', guard: wipOk, actions: allow }, wipNo],
        MOVE_TO_REVIEW: { target: 'review', actions: allow },
        MOVE_TO_DONE: [
          { target: 'done', guard: and([{ type: 'passes', params: { guardId: 'done-only-from-review' as const } }, wipOk]), actions: allow },
          { guard: { type: 'fails', params: { guardId: 'done-only-from-review' } }, actions: { type: 'mark', params: { verdict: { allowed: false, rule: 'done-only-from-review' } } } },
          wipNo,
        ],
      },
    },
    done: {
      on: {
        MOVE_TO_TODO: [{ target: 'todo', guard: wipOk, actions: allow }, wipNo],
        MOVE_TO_IN_DEV: [{ target: 'in-dev', guard: wipOk, actions: allow }, wipNo],
        MOVE_TO_REVIEW: [{ target: 'review', guard: wipOk, actions: allow }, wipNo],
        MOVE_TO_DONE: { target: 'done', actions: allow },
      },
    },
  },
});

const driftedEvaluate = (board: TeamBoardState, move: TeamMove, limits: WipLimits): MoveVerdict => {
  const card = findCard(board, move.cardId);
  if (card === undefined) return { allowed: false, rule: 'unknown-card' };
  const snapshot = driftedMachine.resolveState({
    value: card.column,
    context: { cardId: move.cardId, board, limits, verdict: null },
  });
  const next = getNextSnapshot(driftedMachine, snapshot, driftEventByColumn[move.toColumn]);
  const { verdict } = next.context;
  if (verdict === null) throw new Error('drifted machine produced no verdict');
  return verdict;
};

interface Mismatch {
  readonly scenario: Scenario;
  readonly client: MoveVerdict;
  readonly server: MoveVerdict;
}

const findMismatches = (
  evaluate: (b: TeamBoardState, m: TeamMove, l: WipLimits) => MoveVerdict,
): readonly Mismatch[] =>
  scenarios.flatMap((scenario) => {
    const client = evaluate(scenario.board, scenario.move, scenario.limits);
    const server = canApplyMove(scenario.board, scenario.move, scenario.limits);
    if (client.allowed !== server.allowed) return [{ scenario, client, server }];
    if (!client.allowed && !server.allowed && client.rule !== server.rule) {
      return [{ scenario, client, server }];
    }
    return [];
  });

describe('b-table drift-proof', () => {
  it('derived machine and server check agree on every (state, event) pair', () => {
    expect(scenarios.length).toBeGreaterThan(0);
    expect(findMismatches(evaluateMove)).toEqual([]);
  });

  it('exercises every rejection rule and at least one allowance (non-vacuity)', () => {
    const seenRules = new Set<RuleId>();
    let allowedCount = 0;
    for (const { board, move, limits } of scenarios) {
      const verdict = canApplyMove(board, move, limits);
      if (verdict.allowed) allowedCount += 1;
      else seenRules.add(verdict.rule);
    }
    const required: readonly RuleId[] = [
      'unknown-card',
      'done-only-from-review',
      'review-requires-in-dev',
      'wip-limit',
    ];
    for (const rule of required) expect(seenRules.has(rule)).toBe(true);
    expect(allowedCount).toBeGreaterThan(0);
  });

  it('catches drift: the hand-written machine that dropped a guard diverges', () => {
    const mismatches = findMismatches(driftedEvaluate);
    expect(mismatches.length).toBeGreaterThan(0);
    expect(
      mismatches.some(
        (m) => m.scenario.move.toColumn === 'review' && m.client.allowed && !m.server.allowed,
      ),
    ).toBe(true);
  });
});
