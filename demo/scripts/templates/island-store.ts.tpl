import { createStore } from '@xstate/store';

import { type __SINGULAR_PASCAL__Event } from './events.js';

/**
 * Store — the RUNG 2 machine behind the __SINGULAR_KEBAB__ island seam
 * (@xstate/store; the OWNER'S first choice — its event map IS the seam). Every
 * DOMAIN member of `__SINGULAR_PASCAL__Event` has a matching handler in the `on`
 * map below, so the compiler ties the event contract to the store. Views never
 * import this file — they talk to ./index.ts (`send` in, selectors out); the
 * machine stays swappable behind that boundary.
 *
 * Modeled on the a-xstate-store spike: an optimistic list with single-step undo.
 * The gateway is INJECTED (this is a factory over its deps) so the core is pure
 * and unit-testable with a fake gateway — no network in a test.
 */

export interface __SINGULAR_PASCAL__Item {
  readonly id: string;
  readonly title: string;
}

export type GatewayResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

/**
 * The persistence seam for optimistic flows. The store applies an edit locally
 * FIRST (optimistic), then calls the gateway; on failure it rolls back to the
 * pre-op snapshot. Inject a real implementation in ./index.ts (a core/client
 * mutation, a fetch adapter); inject a fake in tests.
 */
export interface __SINGULAR_PASCAL__Gateway {
  addItem(input: {
    readonly id: string;
    readonly title: string;
    readonly index: number;
  }): Promise<GatewayResult>;
  moveItem(input: { readonly itemId: string; readonly toIndex: number }): Promise<GatewayResult>;
  removeItem(input: { readonly itemId: string }): Promise<GatewayResult>;
}

export interface __SINGULAR_PASCAL__Deps {
  readonly gateway: __SINGULAR_PASCAL__Gateway;
  readonly generateId: () => string;
}

export interface __SINGULAR_PASCAL__Store {
  send(event: __SINGULAR_PASCAL__Event): void;
  subscribe(listener: () => void): () => void;
  readonly selectors: {
    items(): readonly __SINGULAR_PASCAL__Item[];
    canUndo(): boolean;
  };
}

// The single committed op we can reverse. Its `kind` names the inverse gateway
// call to make on undo. This is the only state beyond the items themselves.
type UndoOp =
  | { readonly kind: 'add'; readonly id: string; readonly title: string; readonly index: number }
  | { readonly kind: 'move'; readonly itemId: string; readonly toIndex: number }
  | { readonly kind: 'remove'; readonly itemId: string };

interface Ctx {
  readonly items: readonly __SINGULAR_PASCAL__Item[];
  readonly undo: UndoOp | null;
}

// Internal settlement events. They are NOT part of __SINGULAR_PASCAL__Event — the
// public `send` accepts only __SINGULAR_PASCAL__Event; these travel from the async
// gateway effect back into the store to commit or roll back the optimistic apply.
type SettleEvent =
  | { readonly type: '_committed'; readonly undo: UndoOp | null }
  | {
      readonly type: '_rolledBack';
      readonly items: readonly __SINGULAR_PASCAL__Item[];
      readonly undo: UndoOp | null;
    };

const indexOf = (items: readonly __SINGULAR_PASCAL__Item[], itemId: string): number =>
  items.findIndex((item) => item.id === itemId);

const insertAt = (
  items: readonly __SINGULAR_PASCAL__Item[],
  item: __SINGULAR_PASCAL__Item,
  index: number,
): readonly __SINGULAR_PASCAL__Item[] => {
  // Clamp the raw payload index BEFORE it touches the array (and, in a real
  // island, before the gateway): a view can send any toIndex, so pin it into
  // [0, length] here — the spike's toIndex-clamp finding. One clamp, one place.
  const clamped = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, clamped), item, ...items.slice(clamped)];
};

const withoutItem = (
  items: readonly __SINGULAR_PASCAL__Item[],
  itemId: string,
): readonly __SINGULAR_PASCAL__Item[] => items.filter((item) => item.id !== itemId);

const moveTo = (
  items: readonly __SINGULAR_PASCAL__Item[],
  itemId: string,
  toIndex: number,
): readonly __SINGULAR_PASCAL__Item[] => {
  const item = items.find((candidate) => candidate.id === itemId);
  if (item === undefined) return items;
  return insertAt(withoutItem(items, itemId), item, toIndex);
};

const settleEvent = (
  result: GatewayResult,
  commitUndo: UndoOp | null,
  prevItems: readonly __SINGULAR_PASCAL__Item[],
  prevUndo: UndoOp | null,
): SettleEvent =>
  result.ok
    ? { type: '_committed', undo: commitUndo }
    : { type: '_rolledBack', items: prevItems, undo: prevUndo };

export const create__SINGULAR_PASCAL__Store = (
  deps: __SINGULAR_PASCAL__Deps,
): __SINGULAR_PASCAL__Store => {
  const { gateway, generateId } = deps;

  // Apply the inverse of the last op to the items and name the gateway call that
  // persists it. Single source: `kind` decides both.
  const applyUndo = (
    items: readonly __SINGULAR_PASCAL__Item[],
    op: UndoOp,
  ): {
    readonly items: readonly __SINGULAR_PASCAL__Item[];
    readonly call: () => Promise<GatewayResult>;
  } => {
    switch (op.kind) {
      case 'add':
        return {
          items: insertAt(items, { id: op.id, title: op.title }, op.index),
          call: () => gateway.addItem({ id: op.id, title: op.title, index: op.index }),
        };
      case 'move':
        return {
          items: moveTo(items, op.itemId, op.toIndex),
          call: () => gateway.moveItem({ itemId: op.itemId, toIndex: op.toIndex }),
        };
      case 'remove':
        return {
          items: withoutItem(items, op.itemId),
          call: () => gateway.removeItem({ itemId: op.itemId }),
        };
    }
  };

  const initial: Ctx = { items: [], undo: null };

  const store = createStore({
    context: initial,
    on: {
      itemAddRequested: (ctx, event: { title: string }, enq) => {
        const id = generateId();
        const index = ctx.items.length;
        const prevItems = ctx.items;
        const prevUndo = ctx.undo;
        const commitUndo: UndoOp = { kind: 'remove', itemId: id };
        enq.effect(({ send }) => {
          void gateway
            .addItem({ id, title: event.title, index })
            .then((result) => send(settleEvent(result, commitUndo, prevItems, prevUndo)));
        });
        return { items: insertAt(prevItems, { id, title: event.title }, index), undo: prevUndo };
      },

      itemMoveRequested: (ctx, event: { itemId: string; toIndex: number }, enq) => {
        const from = indexOf(ctx.items, event.itemId);
        if (from === -1) return;
        const prevItems = ctx.items;
        const prevUndo = ctx.undo;
        const commitUndo: UndoOp = { kind: 'move', itemId: event.itemId, toIndex: from };
        enq.effect(({ send }) => {
          void gateway
            .moveItem({ itemId: event.itemId, toIndex: event.toIndex })
            .then((result) => send(settleEvent(result, commitUndo, prevItems, prevUndo)));
        });
        return { items: moveTo(prevItems, event.itemId, event.toIndex), undo: prevUndo };
      },

      itemRemoveRequested: (ctx, event: { itemId: string }, enq) => {
        const item = ctx.items.find((candidate) => candidate.id === event.itemId);
        if (item === undefined) return;
        const prevItems = ctx.items;
        const prevUndo = ctx.undo;
        const commitUndo: UndoOp = {
          kind: 'add',
          id: item.id,
          title: item.title,
          index: indexOf(ctx.items, item.id),
        };
        enq.effect(({ send }) => {
          void gateway
            .removeItem({ itemId: event.itemId })
            .then((result) => send(settleEvent(result, commitUndo, prevItems, prevUndo)));
        });
        return { items: withoutItem(prevItems, event.itemId), undo: prevUndo };
      },

      undoRequested: (ctx, _event: { type: 'undoRequested' }, enq) => {
        const op = ctx.undo;
        if (op === null) return;
        const prevItems = ctx.items;
        const applied = applyUndo(prevItems, op);
        enq.effect(({ send }) => {
          void applied.call().then((result) => send(settleEvent(result, null, prevItems, op)));
        });
        return { items: applied.items, undo: op };
      },

      _committed: (ctx, event: { undo: UndoOp | null }) => ({ items: ctx.items, undo: event.undo }),

      _rolledBack: (
        _ctx,
        event: { items: readonly __SINGULAR_PASCAL__Item[]; undo: UndoOp | null },
      ) => ({ items: event.items, undo: event.undo }),
    },
  });

  return {
    send: (event: __SINGULAR_PASCAL__Event): void => {
      switch (event.type) {
        case 'refreshRequested':
          // The server-read seam: no client state to mutate (the fresh list
          // comes from core/selectors.ts via TanStack Query). Kept as a no-op so
          // the view's `send` call is uniform across rungs.
          return;
        case 'itemAddRequested':
        case 'itemMoveRequested':
        case 'itemRemoveRequested':
        case 'undoRequested':
          store.send(event);
          return;
      }
    },
    subscribe: (listener: () => void): (() => void) => {
      const subscription = store.subscribe(() => {
        listener();
      });
      return () => {
        subscription.unsubscribe();
      };
    },
    selectors: {
      items: (): readonly __SINGULAR_PASCAL__Item[] => store.getSnapshot().context.items,
      canUndo: (): boolean => store.getSnapshot().context.undo !== null,
    },
  };
};
