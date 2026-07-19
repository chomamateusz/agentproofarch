/**
 * Events — the write seam of the __SINGULAR_KEBAB__ island (events-in). A view
 * never mutates state or calls the store directly: it describes WHAT THE USER
 * DID as a closed union of intent events and hands them to `send` (./index.ts).
 * The core decides what to do with them.
 *
 * RUNG 2 (island store): every DOMAIN member below has a matching handler in the
 * store's `on` map (core/store.ts), so the compiler ties the two together — the
 * event map IS the seam. `refreshRequested` stays the server-read seam (a no-op
 * in the store; the fresh list comes from core/selectors.ts via TanStack Query).
 *
 * NAMING TAXONOMY (lint-enforced on this union: agentproofarch/event-suffix-taxonomy):
 * every member names a user INTENT in the past / imperative-of-intent tense,
 * never a decision the core should own. Allowed suffixes:
 *   …Requested | …Confirmed | …Cancelled | …Changed | …Selected | …Opened |
 *   …Closed | …Added | …Moved | …Removed | …Failed | …Succeeded
 * Good: `itemMoveRequested`, `filterChanged`. Bad: `moveItem`, `setFilter`
 * (imperatives smuggle the core's decision into the view — and fail lint).
 */
export type __SINGULAR_PASCAL__Event =
  // The server-read seam (no client state to change) — kept so the view's `send`
  // call is uniform across rungs.
  | { type: 'refreshRequested' }
  // Example optimistic-list intents — replace with this island's real events.
  // Each maps 1:1 to a handler in core/store.ts.
  | { type: 'itemAddRequested'; title: string }
  | { type: 'itemMoveRequested'; itemId: string; toIndex: number }
  | { type: 'itemRemoveRequested'; itemId: string }
  | { type: 'undoRequested' };
