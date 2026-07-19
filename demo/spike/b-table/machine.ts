import { and, assign, getNextSnapshot, setup } from 'xstate';
import {
  COLUMNS,
  type ColumnId,
  type MoveVerdict,
  type TeamBoardState,
  type TeamMove,
  type WipLimits,
} from '../core-contract';
import { buildGuardContext, findCard, type GuardId, guards, transitionTable } from './table';

interface MachineContext {
  readonly cardId: string;
  readonly board: TeamBoardState;
  readonly limits: WipLimits;
  readonly verdict: MoveVerdict | null;
}

type MachineEvent =
  | { readonly type: 'MOVE_TO_TODO' }
  | { readonly type: 'MOVE_TO_IN_DEV' }
  | { readonly type: 'MOVE_TO_REVIEW' }
  | { readonly type: 'MOVE_TO_DONE' };

const eventByColumn: Readonly<Record<ColumnId, MachineEvent['type']>> = {
  todo: 'MOVE_TO_TODO',
  'in-dev': 'MOVE_TO_IN_DEV',
  review: 'MOVE_TO_REVIEW',
  done: 'MOVE_TO_DONE',
};

const columnByEvent: Readonly<Record<MachineEvent['type'], ColumnId>> = {
  MOVE_TO_TODO: 'todo',
  MOVE_TO_IN_DEV: 'in-dev',
  MOVE_TO_REVIEW: 'review',
  MOVE_TO_DONE: 'done',
};

const moveEventByColumn: Readonly<Record<ColumnId, MachineEvent>> = {
  todo: { type: 'MOVE_TO_TODO' },
  'in-dev': { type: 'MOVE_TO_IN_DEV' },
  review: { type: 'MOVE_TO_REVIEW' },
  done: { type: 'MOVE_TO_DONE' },
};

const contextCarrier: MachineContext = {
  cardId: '',
  board: { cards: [] },
  limits: {},
  verdict: null,
};
// FINDING: XState's `types` field infers TEvent from the value passed, and a
// single object literal collapses a union to its first member. The idiomatic
// fix is `{} as MachineEvent`, but `as` is banned here — so the carrier must be
// a value whose STATIC type is already the full union. `moveEventByColumn` is a
// `Record<ColumnId, MachineEvent>`, so indexing it yields `MachineEvent` intact.
const eventCarrier: MachineEvent = moveEventByColumn.todo;

const guardHolds = (
  guardId: GuardId,
  context: MachineContext,
  event: MachineEvent,
): boolean => {
  const card = findCard(context.board, context.cardId);
  if (card === undefined) return false;
  const move: TeamMove = { cardId: context.cardId, toColumn: columnByEvent[event.type] };
  return guards[guardId](buildGuardContext(card, move, context.board, context.limits));
};

const factory = setup({
  types: { context: contextCarrier, events: eventCarrier },
  guards: {
    guardPasses: ({ context, event }, params: { readonly guardId: GuardId }) =>
      guardHolds(params.guardId, context, event),
    guardFails: ({ context, event }, params: { readonly guardId: GuardId }) =>
      !guardHolds(params.guardId, context, event),
  },
  actions: {
    markVerdict: assign((_args, params: { readonly verdict: MoveVerdict }) => ({
      verdict: params.verdict,
    })),
  },
});

const allow = { type: 'markVerdict' as const, params: { verdict: { allowed: true } } };
const reject = (rule: GuardId) => ({
  type: 'markVerdict' as const,
  params: { verdict: { allowed: false, rule } },
});
const passesRef = (guardId: GuardId) => ({ type: 'guardPasses' as const, params: { guardId } });
const failsRef = (guardId: GuardId) => ({ type: 'guardFails' as const, params: { guardId } });

const transitionsFor = (from: ColumnId, to: ColumnId) => {
  if (to === from) return { target: to, actions: allow };
  const guardIds = transitionTable[to];
  return [
    { target: to, guard: and(guardIds.map(passesRef)), actions: allow },
    ...guardIds.map((guardId) => ({ guard: failsRef(guardId), actions: reject(guardId) })),
  ];
};

const buildStates = () =>
  Object.fromEntries(
    COLUMNS.map((from) => [
      from,
      {
        on: Object.fromEntries(
          COLUMNS.map((to) => [eventByColumn[to], transitionsFor(from, to)]),
        ),
      },
    ]),
  );

export const boardMachine = factory.createMachine({
  initial: 'todo',
  context: contextCarrier,
  states: buildStates(),
});

export const evaluateMove = (
  board: TeamBoardState,
  move: TeamMove,
  limits: WipLimits,
): MoveVerdict => {
  const card = findCard(board, move.cardId);
  if (card === undefined) return { allowed: false, rule: 'unknown-card' };
  const snapshot = boardMachine.resolveState({
    value: card.column,
    context: { cardId: move.cardId, board, limits, verdict: null },
  });
  const next = getNextSnapshot(boardMachine, snapshot, moveEventByColumn[move.toColumn]);
  const { verdict } = next.context;
  if (verdict === null) {
    throw new Error(`machine produced no verdict for ${card.column} -> ${move.toColumn}`);
  }
  return verdict;
};
