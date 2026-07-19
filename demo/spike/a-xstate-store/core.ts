import { createStore } from '@xstate/store';
import {
  COLUMNS,
  type BoardEvent,
  type BoardState,
  type Card,
  type ColumnId,
  type CoreApi,
  type CoreFactory,
  type GatewayResult,
} from '../core-contract';

// The single committed op we can reverse. Its `kind` doubles as the gateway
// call to make on undo: 'add' -> addCard, 'move' -> moveCard, 'remove' ->
// removeCard. This is the only piece of state beyond the cards themselves.
type UndoOp =
  | { readonly kind: 'add'; readonly id: string; readonly title: string; readonly column: ColumnId; readonly index: number }
  | { readonly kind: 'move'; readonly cardId: string; readonly toColumn: ColumnId; readonly toIndex: number }
  | { readonly kind: 'remove'; readonly cardId: string };

interface Ctx {
  readonly cards: readonly Card[];
  readonly undo: UndoOp | null;
}

// Internal settlement events. They are NOT part of BoardEvent — the public
// `send` only accepts BoardEvent; these travel from the async gateway effect
// back into the store to commit or roll back the optimistic apply.
type CommitEvent = { readonly type: '_committed'; readonly undo: UndoOp | null };
type RollbackEvent = {
  readonly type: '_rolledBack';
  readonly cards: readonly Card[];
  readonly undo: UndoOp | null;
};
type SettleEvent = CommitEvent | RollbackEvent;

const columnCards = (cards: readonly Card[], column: ColumnId): readonly Card[] =>
  cards.filter((card) => card.column === column);

const indexInColumn = (cards: readonly Card[], cardId: string, column: ColumnId): number =>
  columnCards(cards, column).findIndex((card) => card.id === cardId);

const insertAt = (cards: readonly Card[], card: Card, index: number): readonly Card[] => {
  const clamped = Math.max(0, Math.min(index, columnCards(cards, card.column).length));
  const result: Card[] = [];
  let seen = 0;
  let inserted = false;
  for (const existing of cards) {
    if (!inserted && existing.column === card.column && seen === clamped) {
      result.push(card);
      inserted = true;
    }
    if (existing.column === card.column) seen += 1;
    result.push(existing);
  }
  if (!inserted) result.push(card);
  return result;
};

const withoutCard = (cards: readonly Card[], cardId: string): readonly Card[] =>
  cards.filter((card) => card.id !== cardId);

const moveTo = (
  cards: readonly Card[],
  cardId: string,
  toColumn: ColumnId,
  toIndex: number,
): readonly Card[] => {
  const card = cards.find((candidate) => candidate.id === cardId);
  if (card === undefined) return cards;
  return insertAt(withoutCard(cards, cardId), { ...card, column: toColumn }, toIndex);
};

const settleEvent = (
  result: GatewayResult,
  commitUndo: UndoOp | null,
  prevCards: readonly Card[],
  prevUndo: UndoOp | null,
): SettleEvent =>
  result.ok
    ? { type: '_committed', undo: commitUndo }
    : { type: '_rolledBack', cards: prevCards, undo: prevUndo };

export const createCore: CoreFactory = ({ gateway, generateId }) => {
  // Apply the inverse of the last op to the cards and name the gateway call
  // that persists it. Single source: `kind` decides both.
  const applyUndo = (
    cards: readonly Card[],
    op: UndoOp,
  ): { readonly cards: readonly Card[]; readonly call: () => Promise<GatewayResult> } => {
    switch (op.kind) {
      case 'add':
        return {
          cards: insertAt(cards, { id: op.id, title: op.title, column: op.column }, op.index),
          call: () => gateway.addCard({ id: op.id, title: op.title, column: op.column, index: op.index }),
        };
      case 'move':
        return {
          cards: moveTo(cards, op.cardId, op.toColumn, op.toIndex),
          call: () => gateway.moveCard({ cardId: op.cardId, toColumn: op.toColumn, toIndex: op.toIndex }),
        };
      case 'remove':
        return {
          cards: withoutCard(cards, op.cardId),
          call: () => gateway.removeCard({ cardId: op.cardId }),
        };
    }
  };

  const initial: Ctx = { cards: [], undo: null };

  const store = createStore({
    context: initial,
    on: {
      cardAdded: (ctx, event: { title: string; column: ColumnId }, enq) => {
        const id = generateId();
        const index = columnCards(ctx.cards, event.column).length;
        const prevCards = ctx.cards;
        const prevUndo = ctx.undo;
        const commitUndo: UndoOp = { kind: 'remove', cardId: id };
        enq.effect(({ send }) => {
          void gateway
            .addCard({ id, title: event.title, column: event.column, index })
            .then((result) => send(settleEvent(result, commitUndo, prevCards, prevUndo)));
        });
        return { cards: insertAt(prevCards, { id, title: event.title, column: event.column }, index), undo: prevUndo };
      },

      cardMoved: (ctx, event: { cardId: string; toColumn: ColumnId; toIndex: number }, enq) => {
        const card = ctx.cards.find((candidate) => candidate.id === event.cardId);
        if (card === undefined) return;
        const prevCards = ctx.cards;
        const prevUndo = ctx.undo;
        const commitUndo: UndoOp = {
          kind: 'move',
          cardId: card.id,
          toColumn: card.column,
          toIndex: indexInColumn(ctx.cards, card.id, card.column),
        };
        enq.effect(({ send }) => {
          void gateway
            .moveCard({ cardId: event.cardId, toColumn: event.toColumn, toIndex: event.toIndex })
            .then((result) => send(settleEvent(result, commitUndo, prevCards, prevUndo)));
        });
        return { cards: moveTo(prevCards, event.cardId, event.toColumn, event.toIndex), undo: prevUndo };
      },

      cardRemoved: (ctx, event: { cardId: string }, enq) => {
        const card = ctx.cards.find((candidate) => candidate.id === event.cardId);
        if (card === undefined) return;
        const prevCards = ctx.cards;
        const prevUndo = ctx.undo;
        const commitUndo: UndoOp = {
          kind: 'add',
          id: card.id,
          title: card.title,
          column: card.column,
          index: indexInColumn(ctx.cards, card.id, card.column),
        };
        enq.effect(({ send }) => {
          void gateway
            .removeCard({ cardId: event.cardId })
            .then((result) => send(settleEvent(result, commitUndo, prevCards, prevUndo)));
        });
        return { cards: withoutCard(prevCards, event.cardId), undo: prevUndo };
      },

      undoRequested: (ctx, _event: { type: 'undoRequested' }, enq) => {
        const op = ctx.undo;
        if (op === null) return;
        const prevCards = ctx.cards;
        const applied = applyUndo(prevCards, op);
        enq.effect(({ send }) => {
          void applied.call().then((result) => send(settleEvent(result, null, prevCards, op)));
        });
        return { cards: applied.cards, undo: op };
      },

      _committed: (ctx, event: { undo: UndoOp | null }) => ({ cards: ctx.cards, undo: event.undo }),

      _rolledBack: (_ctx, event: { cards: readonly Card[]; undo: UndoOp | null }) => ({
        cards: event.cards,
        undo: event.undo,
      }),
    },
  });

  const cards = (): readonly Card[] => store.getSnapshot().context.cards;

  return {
    send: (event: BoardEvent) => {
      store.send(event);
    },
    getState: (): BoardState => ({ cards: cards() }),
    subscribe: (listener) => {
      const subscription = store.subscribe(() => {
        listener();
      });
      return () => {
        subscription.unsubscribe();
      };
    },
    selectors: {
      listColumns: () => COLUMNS,
      cardsIn: (column) => columnCards(cards(), column),
      canUndo: () => store.getSnapshot().context.undo !== null,
    },
  };
};
