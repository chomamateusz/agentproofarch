import { createStore } from 'zustand/vanilla';
import {
  COLUMNS,
  type BoardEvent,
  type BoardState,
  type Card,
  type ColumnId,
  type CoreApi,
  type CoreDeps,
  type GatewayResult,
} from '../core-contract';

type Op =
  | { readonly kind: 'add'; readonly card: Card; readonly index: number }
  | {
      readonly kind: 'move';
      readonly cardId: string;
      readonly toColumn: ColumnId;
      readonly toIndex: number;
      readonly fromColumn: ColumnId;
      readonly fromIndex: number;
    }
  | { readonly kind: 'remove'; readonly card: Card; readonly fromIndex: number };

interface StoreState {
  readonly cards: readonly Card[];
  readonly undo: Op | null;
}

const insertAt = (
  cards: readonly Card[],
  card: Card,
  column: ColumnId,
  index: number,
): readonly Card[] => {
  const colCards = cards.filter((candidate) => candidate.column === column);
  const clamped = Math.max(0, Math.min(index, colCards.length));
  const target = colCards[clamped];
  if (target === undefined) return [...cards, card];
  const pos = cards.indexOf(target);
  return [...cards.slice(0, pos), card, ...cards.slice(pos)];
};

const applyOp = (cards: readonly Card[], op: Op): readonly Card[] => {
  switch (op.kind) {
    case 'add':
      return insertAt(cards, op.card, op.card.column, op.index);
    case 'move': {
      const moved = cards.find((candidate) => candidate.id === op.cardId);
      if (moved === undefined) return cards;
      const without = cards.filter((candidate) => candidate.id !== op.cardId);
      return insertAt(without, { ...moved, column: op.toColumn }, op.toColumn, op.toIndex);
    }
    case 'remove':
      return cards.filter((candidate) => candidate.id !== op.card.id);
  }
};

const runGateway = (deps: CoreDeps, op: Op): Promise<GatewayResult> => {
  switch (op.kind) {
    case 'add':
      return deps.gateway.addCard({
        id: op.card.id,
        title: op.card.title,
        column: op.card.column,
        index: op.index,
      });
    case 'move':
      return deps.gateway.moveCard({
        cardId: op.cardId,
        toColumn: op.toColumn,
        toIndex: op.toIndex,
      });
    case 'remove':
      return deps.gateway.removeCard({ cardId: op.card.id });
  }
};

const inverseOf = (op: Op): Op => {
  switch (op.kind) {
    case 'add':
      return { kind: 'remove', card: op.card, fromIndex: op.index };
    case 'move':
      return {
        kind: 'move',
        cardId: op.cardId,
        toColumn: op.fromColumn,
        toIndex: op.fromIndex,
        fromColumn: op.toColumn,
        fromIndex: op.toIndex,
      };
    case 'remove':
      return { kind: 'add', card: op.card, index: op.fromIndex };
  }
};

const columnIndexOf = (cards: readonly Card[], card: Card): number =>
  cards
    .filter((candidate) => candidate.column === card.column)
    .findIndex((candidate) => candidate.id === card.id);

export const createCore = (deps: CoreDeps): CoreApi => {
  const store = createStore<StoreState>()(() => ({ cards: [], undo: null }));

  const dispatch = (op: Op, isUndoStep: boolean): void => {
    const snapshot = store.getState().cards;
    store.setState({ cards: applyOp(snapshot, op) });
    void runGateway(deps, op).then((result) => {
      if (result.ok) {
        store.setState(() => ({ undo: isUndoStep ? null : inverseOf(op) }));
      } else {
        store.setState({ cards: snapshot });
      }
    });
  };

  const toForwardOp = (event: BoardEvent): Op | null => {
    const cards = store.getState().cards;
    switch (event.type) {
      case 'cardAdded': {
        const index = cards.filter((card) => card.column === event.column).length;
        return {
          kind: 'add',
          card: { id: deps.generateId(), title: event.title, column: event.column },
          index,
        };
      }
      case 'cardMoved': {
        const card = cards.find((candidate) => candidate.id === event.cardId);
        if (card === undefined) return null;
        return {
          kind: 'move',
          cardId: event.cardId,
          toColumn: event.toColumn,
          toIndex: event.toIndex,
          fromColumn: card.column,
          fromIndex: columnIndexOf(cards, card),
        };
      }
      case 'cardRemoved': {
        const card = cards.find((candidate) => candidate.id === event.cardId);
        if (card === undefined) return null;
        return { kind: 'remove', card, fromIndex: columnIndexOf(cards, card) };
      }
      case 'undoRequested':
        return null;
    }
  };

  const send = (event: BoardEvent): void => {
    if (event.type === 'undoRequested') {
      const undo = store.getState().undo;
      if (undo === null) return;
      dispatch(undo, true);
      return;
    }
    const op = toForwardOp(event);
    if (op === null) return;
    dispatch(op, false);
  };

  return {
    send,
    getState: (): BoardState => ({ cards: store.getState().cards }),
    subscribe: (listener) => store.subscribe(() => listener()),
    selectors: {
      listColumns: () => [...COLUMNS],
      cardsIn: (column) => store.getState().cards.filter((card) => card.column === column),
      canUndo: () => store.getState().undo !== null,
    },
  };
};
