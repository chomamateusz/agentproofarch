import type { __SINGULAR_PASCAL__Event } from './events.js';

export type { __SINGULAR_PASCAL__Event } from './events.js';
export { __SINGULAR_CAMEL__Selectors } from './selectors.js';

/**
 * Public seam of the __SINGULAR_KEBAB__ island core: `send` in, selectors out.
 * A view imports ONLY from this module — never a store, a descriptor or api.ts
 * directly — so the machine behind the seam stays invisible and swappable.
 *
 * `send` is the events-in entry point. RUNG 1 has no client machine, so it is a
 * typed, exhaustive stub: an intent that needs state which outlives a render or
 * coordinates several views is the trigger to graduate the island, and server
 * writes go through mutation descriptors in the view (invalidation → refetch).
 *
 * <<EXTENSION POINT — machine>>
 * When a graduation trigger fires, create the machine in this module and forward
 * events to it: rung 2 → an @xstate/store store, `store.send(event)` (scaffold
 * shape: `--machine=store`); rung 3 → a UI actor consulting the table-derived
 * oracle, `actor.send(event)` (`--machine=statechart`). The view's call —
 * `send({ type: '…Requested' })` — never changes (ADR-0005, decided). See
 * docs/architecture.md §Client application state.
 */
export const send = (event: __SINGULAR_PASCAL__Event): void => {
  switch (event.type) {
    case 'refreshRequested':
      // Rung 1 placeholder: no client state to change yet. Graduate to a store
      // when an intent must change state that outlives a render or coordinates
      // multiple views.
      break;
  }
};
