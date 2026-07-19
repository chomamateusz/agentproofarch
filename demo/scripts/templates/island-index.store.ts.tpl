import { __SINGULAR_CAMEL__Gateway } from '../../../api.js';

import { type __SINGULAR_PASCAL__Event } from './events.js';
import { __SINGULAR_CAMEL__Selectors as __SINGULAR_CAMEL__ServerSelectors } from './selectors.js';
import { create__SINGULAR_PASCAL__Store } from './store.js';

export type { __SINGULAR_PASCAL__Event } from './events.js';

/**
 * Public seam of the __SINGULAR_KEBAB__ island core: `send` in, selectors out.
 * A view imports ONLY from this module — never the store, a descriptor or api.ts
 * directly — so the machine behind the seam stays invisible and swappable.
 *
 * RUNG 2 (island store). `send` forwards every event to the @xstate/store store
 * (core/store.ts); its selectors expose the store's client state ALONGSIDE the
 * server read (`list`). The view's calls — `send({ type: '…Requested' })` and
 * `useQuery(__SINGULAR_CAMEL__Selectors.list)` — never change.
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

export const __SINGULAR_CAMEL__Selectors = {
  // Server read (rung-1 seam, unchanged): the fresh list via TanStack Query.
  ...__SINGULAR_CAMEL__ServerSelectors,
  // Client state derived from the store — plain values, no React, so views never
  // change when the machine behind the seam does.
  items: () => store.selectors.items(),
  canUndo: () => store.selectors.canUndo(),
};
