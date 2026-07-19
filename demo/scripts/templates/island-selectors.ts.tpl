import { actions } from '../../../api.js';

/**
 * Selectors — the read seam of the __SINGULAR_KEBAB__ island (selectors-out).
 * RUNG 1: an island reads SERVER state through bound descriptors from api.ts and
 * keeps no client copy — the seam is a thin re-export. Views subscribe with
 * `useQuery(__SINGULAR_CAMEL__Selectors.list)` and never see ApiClient, a port
 * or an adapter.
 *
 * <<EXTENSION POINT — client selectors>>
 * When the island graduates (rung 2 = island store on @xstate/store, rung 3 =
 * statechart derived from a core/domain transition table — ADR-0005, decided)
 * add client-derived selectors here behind the SAME shape (plain values, no
 * React), so views never change. See docs/architecture.md §Client application
 * state (ADR-0005).
 */
export const __SINGULAR_CAMEL__Selectors = {
  // Replace `actions.__SINGULAR_CAMEL__` with this island's real read descriptor:
  // reuse an existing resource query (e.g. `list: actions.todos`), or scaffold
  // one via `npm run new:resource` and bind it in api.ts. Until it is bound,
  // `npm run check` stays RED.
  list: actions.__SINGULAR_CAMEL__,
};
