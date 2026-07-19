/**
 * Events — the write seam of the __SINGULAR_KEBAB__ island (events-in). A view
 * never mutates state or calls a machine directly: it describes WHAT THE USER
 * DID as a closed union of intent events and hands them to `send` (./index.ts).
 * The core decides what to do with them.
 *
 * NAMING TAXONOMY (review rule today; a lint rule on this union once it lands):
 * every member names a user INTENT in the past / imperative-of-intent tense,
 * never a decision the core should own. Allowed suffixes:
 *   …Requested | …Confirmed | …Cancelled | …Changed | …Selected | …Opened | …Closed
 * Good: `cardMoveRequested`, `filterChanged`. Bad: `moveCard`, `setFilter`
 * (imperatives smuggle the core's decision into the view).
 */
export type __SINGULAR_PASCAL__Event =
  // Example intent — replace with this island's real events. At RUNG 1 there is
  // no client machine, so `refreshRequested` is a seam placeholder handled as a
  // no-op in ./index.ts; it earns real behavior once the island graduates to a
  // store (rung 2) or a statechart (rung 3).
  | { type: 'refreshRequested' };
