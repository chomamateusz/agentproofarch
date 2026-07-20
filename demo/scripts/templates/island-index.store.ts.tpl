import { __SINGULAR_CAMEL__Gateway } from '../../../api.js';

import { type __SINGULAR_PASCAL__Event } from './events.js';
import { __SINGULAR_CAMEL__Selectors as __SINGULAR_CAMEL__ServerSelectors } from './selectors.js';
import {
  canUndoOf,
  create__SINGULAR_PASCAL__Store,
  __SINGULAR_CAMEL__ItemsOf,
  type MergedItem,
  type ServerItem,
  type __SINGULAR_PASCAL__OverlayState,
} from './store.js';

export type { __SINGULAR_PASCAL__Event } from './events.js';
export type { MergedItem, ServerItem } from './store.js';

/**
 * Public seam of the __SINGULAR_KEBAB__ island core: `send` in, selectors out.
 * A view imports ONLY from this module — never the store, a descriptor or api.ts
 * directly — so the machine behind the seam stays invisible and swappable.
 *
 * RUNG 2 (island store). `send` forwards every event to the @xstate/store store
 * (core/store.ts). The server read (`list`) stays the cache truth; `items` merges
 * it with the store's optimistic overlay (the store keeps NO item copy); the view
 * subscribes with `useSyncExternalStore(subscribe, snapshot)` and invalidates the
 * cache once `snapshot().committedRev` advances. The view's calls never change
 * across rungs. This mirrors the living personal board core.
 *
 * <<EXTENSION POINT — gateway>>
 * The store is optimistic: it needs a gateway that persists each edit (see
 * __SINGULAR_PASCAL__Gateway in core/store.ts). Bind a real one in api.ts (a
 * core/client mutation adapter) and import it here — until `__SINGULAR_CAMEL__Gateway`
 * exists, `npm run check` stays RED. See docs/architecture.md §Client application
 * state (ADR-0005).
 */
const store = create__SINGULAR_PASCAL__Store({
  gateway: __SINGULAR_CAMEL__Gateway,
  generateId: () => crypto.randomUUID(),
});

export const send = (event: __SINGULAR_PASCAL__Event): void => {
  store.send(event);
};

export const subscribe = (listener: () => void): (() => void) => store.subscribe(listener);

export const __SINGULAR_CAMEL__Selectors = {
  // Server read (rung-1 seam, unchanged): the fresh list via TanStack Query.
  ...__SINGULAR_CAMEL__ServerSelectors,
  // The overlay snapshot (subscribe with useSyncExternalStore); its `committedRev`
  // tells the view when to invalidate the cache once.
  snapshot: (): __SINGULAR_PASCAL__OverlayState => store.getState(),
  // The MERGE: the server list with the optimistic overlay laid on top. Plain
  // values, no React, so views never change when the machine behind the seam does.
  items: (serverItems: readonly ServerItem[]): readonly MergedItem[] =>
    __SINGULAR_CAMEL__ItemsOf(store.getState(), serverItems),
  canUndo: (): boolean => canUndoOf(store.getState()),
};
