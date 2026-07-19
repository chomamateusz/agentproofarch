import { assign, createActor, fromPromise, setup } from 'xstate';
import {
  type AddCardInput,
  type BoardEvent,
  type BoardState,
  type Card,
  type ColumnId,
  COLUMNS,
  type CoreApi,
  type CoreDeps,
  type CoreFactory,
  type GatewayResult,
  type MoveCardInput,
  type RemoveCardInput,
} from '../core-contract';

type Command =
  | { readonly type: 'add'; readonly add: AddCardInput }
  | { readonly type: 'move'; readonly move: MoveCardInput }
  | { readonly type: 'remove'; readonly remove: RemoveCardInput };

interface Inflight {
  readonly command: Command;
  readonly snapshot: readonly Card[];
  readonly undoAfterCommit: Command | null;
}

interface Ctx {
  readonly cards: readonly Card[];
  readonly undoSlot: Command | null;
  readonly inflight: Inflight | null;
}

const clamp = (value: number, max: number): number => Math.max(0, Math.min(value, max));

const countIn = (cards: readonly Card[], column: ColumnId): number =>
  cards.filter((card) => card.column === column).length;

const columnIndexOf = (cards: readonly Card[], cardId: string, column: ColumnId): number =>
  cards.filter((card) => card.column === column).findIndex((card) => card.id === cardId);

const insertAt = (
  cards: readonly Card[],
  card: Card,
  column: ColumnId,
  index: number,
): readonly Card[] => {
  const out: Card[] = [];
  let seen = 0;
  let placed = false;
  for (const existing of cards) {
    if (!placed && existing.column === column && seen === index) {
      out.push(card);
      placed = true;
    }
    if (existing.column === column) seen += 1;
    out.push(existing);
  }
  if (!placed) out.push(card);
  return out;
};

const applyCommand = (cards: readonly Card[], command: Command): readonly Card[] => {
  switch (command.type) {
    case 'add': {
      const { id, title, column, index } = command.add;
      return insertAt(cards, { id, title, column }, column, index);
    }
    case 'move': {
      const { cardId, toColumn, toIndex } = command.move;
      const moved = cards.find((card) => card.id === cardId);
      if (moved === undefined) return cards;
      const remaining = cards.filter((card) => card.id !== cardId);
      const bounded = clamp(toIndex, countIn(remaining, toColumn));
      return insertAt(remaining, { id: moved.id, title: moved.title, column: toColumn }, toColumn, bounded);
    }
    case 'remove':
      return cards.filter((card) => card.id !== command.remove.cardId);
  }
};

const gatewayResult = (deps: CoreDeps, command: Command): Promise<GatewayResult> => {
  switch (command.type) {
    case 'add':
      return deps.gateway.addCard(command.add);
    case 'move':
      return deps.gateway.moveCard(command.move);
    case 'remove':
      return deps.gateway.removeCard(command.remove);
  }
};

const planFromEvent = (
  cards: readonly Card[],
  undoSlot: Command | null,
  generateId: () => string,
  event: BoardEvent,
): Inflight | null => {
  switch (event.type) {
    case 'cardAdded': {
      const id = generateId();
      const command: Command = {
        type: 'add',
        add: { id, title: event.title, column: event.column, index: countIn(cards, event.column) },
      };
      const inverse: Command = { type: 'remove', remove: { cardId: id } };
      return { command, snapshot: cards, undoAfterCommit: inverse };
    }
    case 'cardMoved': {
      const card = cards.find((candidate) => candidate.id === event.cardId);
      if (card === undefined) return null;
      const priorIndex = columnIndexOf(cards, card.id, card.column);
      const bounded = clamp(event.toIndex, countIn(cards.filter((c) => c.id !== card.id), event.toColumn));
      const command: Command = {
        type: 'move',
        move: { cardId: event.cardId, toColumn: event.toColumn, toIndex: bounded },
      };
      const inverse: Command = {
        type: 'move',
        move: { cardId: card.id, toColumn: card.column, toIndex: priorIndex },
      };
      return { command, snapshot: cards, undoAfterCommit: inverse };
    }
    case 'cardRemoved': {
      const card = cards.find((candidate) => candidate.id === event.cardId);
      if (card === undefined) return null;
      const priorIndex = columnIndexOf(cards, card.id, card.column);
      const command: Command = { type: 'remove', remove: { cardId: card.id } };
      const inverse: Command = {
        type: 'add',
        add: { id: card.id, title: card.title, column: card.column, index: priorIndex },
      };
      return { command, snapshot: cards, undoAfterCommit: inverse };
    }
    case 'undoRequested': {
      if (undoSlot === null) return null;
      return { command: undoSlot, snapshot: cards, undoAfterCommit: null };
    }
  }
};

// XState `setup({ types })` infers each phantom slot from the *value expression*,
// not from a variable's declared type: a `const EVENT_TYPE: BoardEvent = …`
// collapses `events` to the single literal member it was initialised with. The
// canonical library idiom is `{} as BoardEvent`, but `as` is banned here — a
// function whose return type is the union keeps the full union at the call site.
const contextType: Ctx = { cards: [], undoSlot: null, inflight: null };
const eventType = (): BoardEvent => ({ type: 'undoRequested' });

const buildMachine = (deps: CoreDeps) =>
  setup({
    types: {
      context: contextType,
      events: eventType(),
    },
    actors: {
      gateway: fromPromise<GatewayResult, Command>(({ input }) => gatewayResult(deps, input)),
    },
    guards: {
      hasCard: ({ context, event }) =>
        (event.type === 'cardMoved' || event.type === 'cardRemoved') &&
        context.cards.some((card) => card.id === event.cardId),
      canUndo: ({ context }) => context.undoSlot !== null,
    },
    actions: {
      applyStart: assign(({ context, event }) => {
        const inflight = planFromEvent(context.cards, context.undoSlot, deps.generateId, event);
        if (inflight === null) return {};
        return { cards: applyCommand(context.cards, inflight.command), inflight };
      }),
      commit: assign(({ context }) => {
        if (context.inflight === null) return {};
        return { undoSlot: context.inflight.undoAfterCommit, inflight: null };
      }),
      rollback: assign(({ context }) => {
        if (context.inflight === null) return {};
        return { cards: context.inflight.snapshot, inflight: null };
      }),
    },
  }).createMachine({
    id: 'personalBoard',
    initial: 'idle',
    context: { cards: [], undoSlot: null, inflight: null },
    states: {
      idle: {
        on: {
          cardAdded: { target: 'pending', actions: 'applyStart' },
          cardMoved: { target: 'pending', guard: 'hasCard', actions: 'applyStart' },
          cardRemoved: { target: 'pending', guard: 'hasCard', actions: 'applyStart' },
          undoRequested: { target: 'pending', guard: 'canUndo', actions: 'applyStart' },
        },
      },
      pending: {
        invoke: {
          src: 'gateway',
          input: ({ context }) => {
            if (context.inflight === null) throw new Error('pending state entered without an inflight op');
            return context.inflight.command;
          },
          onDone: [
            { guard: ({ event }) => event.output.ok, target: 'idle', actions: 'commit' },
            { target: 'idle', actions: 'rollback' },
          ],
          onError: { target: 'idle', actions: 'rollback' },
        },
      },
    },
  });

export const createCore: CoreFactory = (deps: CoreDeps): CoreApi => {
  const actor = createActor(buildMachine(deps));
  actor.start();

  const getState = (): BoardState => ({ cards: actor.getSnapshot().context.cards });

  return {
    send: (event) => {
      actor.send(event);
    },
    getState,
    subscribe: (listener) => {
      const subscription = actor.subscribe(() => {
        listener();
      });
      return () => {
        subscription.unsubscribe();
      };
    },
    selectors: {
      listColumns: () => [...COLUMNS],
      cardsIn: (column) => actor.getSnapshot().context.cards.filter((card) => card.column === column),
      canUndo: () => actor.getSnapshot().context.undoSlot !== null,
    },
  };
};
