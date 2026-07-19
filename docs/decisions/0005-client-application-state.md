# ADR-0005: Client application state — island cores with a ladder of machines

Date: 2026-07-19 · Status: accepted (2026-07-19), with the two machine choices
deferred to the owner after a code spike (see Consequences)

## Context

The architecture regulates the server-state seam completely —
[server-state.md](../server-state.md) covers descriptors, the CQRS partition,
the QueryClient policy, optimistic updates — but client application state was
one paragraph: *`useState`/`useReducer` local to the feature, context for
cross-cutting concerns, no global state libraries*. That holds for CRUD lists
and says nothing about where interaction state lives once a feature has real
client state: multi-step edits, drag lifecycles, optimistic sequences with
undo. Without a rule, every agent facing such a feature invents its own
topology — exactly the "two paths without a selection rule" failure this
architecture exists to prevent.

The gap surfaced while auditing an external (anonymized) frontend-guidelines
document. Most of that document did not survive adversarial review: strict
assumptions with zero enforcement, a hand-rolled view factory reimplementing
what React context provides, reads and writes mixed on one channel. Its
strongest concept did survive: **a framework-agnostic client core that views
talk to through events in and subscriptions out, with the state machinery
invisible behind that seam**. Five negotiation rounds hardened that concept
into this architecture's idioms (CQRS, islands, provider-delivered instances,
anti-port-theater) and produced the decisions below.

## Decision

1. **Island cores.** Every feature (island) has a `core/` module —
   `features/<name>/core/` — with one public API: **events in, selectors
   out**. Views render UI and talk exclusively to their own island's core;
   whatever machine implements the state is invisible behind that API. The
   core is the facade; there is no generic `IStore { get/set/subscribe }`
   interface over the state library (that would be port theater — re-typing a
   library's API without buying replaceability). The web provider/context only
   *delivers* the core instance to the tree; it is a delivery mechanism, not
   an abstraction.

2. **Uniform seam, ladder of machines inside.** The seam exists on every
   feature — no opt-outs, because optionality makes agents guess. What varies
   is the machine inside the core, on a three-rung ladder:
   - **Rung 1 — descriptors**: the core is thin re-exports of the feature's
     bound server-state actions (scaffolder-generated boilerplate; zero state
     library). The default for plain CRUD.
   - **Rung 2 — island store**: real client-side state (a vanilla,
     framework-free store) driven by events.
   - **Rung 3 — statechart (XState)**: explicit states and transitions, for
     processes where illegal transitions must be unrepresentable.
   A core graduates one rung only when a **measurable trigger** fires: state
   survives component unmount; multiple components in the island coordinate;
   optimistic writes span more than one entity; undo/redo; validation logic
   with dependencies. Explicitly enumerable states with legality rules for
   transitions trigger rung 3. The view API is identical on every rung —
   events and selectors — so graduation never touches views.

3. **CQRS at the view seam.** Events are writes (intentions), selectors are
   reads; **an event never returns data**. A view that needs a result of its
   own event reads it through a selector after the state changes. This is the
   `ReadCall`/`WriteCall` partition of `core/client` applied recursively, one
   level up — and the single most important boundary condition: request/
   response over events is how this pattern dies.

4. **Cardinality.** Many views → one island core: the norm. One view →
   **exactly one core: its own island's** — never another island's. A screen
   needing two domains has three legal routes: **(a) route-level
   composition** — the route/layout renders two islands' views side by side,
   each talking to its own core; **(b) core↔core mediation** — island A's core
   subscribes to island B (bus or server cache) and exposes the data through
   its own selectors, so its views still see one seam; **(c) injected app
   globals** — session, theme, permissions arrive as an injected dependency,
   not by reaching into another island. Deleting island B therefore never
   breaks island A's *views* — at most its core's typed subscriptions.

5. **Four core↔core channels**, and only these:
   1. **Server cache** (default for anything durable): core A fires a
      mutation → invalidation → core B's queries refetch. The cache is the
      pub/sub; zero coupling; survives reload.
   2. **Typed signal bus** (ephemeral, client-only): a closed union of typed
      events, each with exactly one owning island; core-to-core only —
      **views never see the bus**. Reserved for signals that never touch the
      server ("palette opened", "cell highlighted"). This is the sanctioned
      shape the architecture previously reserved "at first proven need" —
      the need is now proven; stringly-typed buses remain banned.
   3. **Injected app globals**: session, theme, permissions — a shared
      dependency injected into cores at composition, not "communication".
   4. **URL/router**: coordination through the address (deep links,
      selection) — often the best bus, because it is shareable for free.

6. **The two-machines contract.** The island store and the server cache are
   different machines with disjoint jurisdictions:
   - the island store **never holds a copy of server data** — it reads
     through the cache; optimistic updates go through `onMutate`/rollback;
   - TanStack **never holds edit/interaction state**;
   - the dividing line, verbatim normative: **local state is state that must
     die on reload — anything "save progress" is server state.**
   This is the most common degeneration path of the pattern (a store
   "temporarily" caches a list → a month later it is hand-synchronized), so
   it gets the heaviest enforcement (see architecture.md §Frontend).

7. **Intent-named events.** Events name what the user did, not what should
   happen: `deleteConfirmed`, never `deleteOrder`. The view reports intent;
   the core decides. Each island's events are one closed union in one file,
   member names ending in a past-tense/intent suffix from a fixed taxonomy
   (`…Requested`, `…Confirmed`, `…Cancelled`, `…Changed`, `…Selected`,
   `…Opened`, `…Closed`). The suffix rule cannot guarantee semantics, but it
   makes the imperative form unwritable and pushes vocabulary the right way;
   semantics is a review/AI-tier check.

8. **Pure-TS cores.** An island core is a pure TypeScript module: no React,
   no DOM, no `react-query`. It exposes selectors plus `subscribe`/
   `getState`; the web adapter turns that into a hook in one generated line
   (`useSyncExternalStore` or the store's own binding), and a TUI consumes
   `subscribe(selector, cb)` + `getState()` directly. Same cores, two
   consumers — React in the browser is just one view adapter. This composes
   with what already holds: `core/client` is typed against
   `@tanstack/query-core`, and both candidate machines are
   framework-agnostic.

9. **Isomorphic domain rules for guarded transitions.** When transition
   legality is a *business* rule (WIP limits, an enforced status path), it is
   domain logic, not view logic: implemented client-only it is cosmetics — a
   CLI request would walk straight past it. Such rules live as pure
   predicates in `core/domain` (e.g. `canMoveCard(card, from, to, board)`);
   the server use-case enforces them on mutation; the island's machine wires
   the same predicates as transition guards for instant UX (blocked drop,
   with a reason). Rules once, executed on both sides. **Recommended shape,
   decision-pending**: the transition table as plain data in `core/domain`
   (allowed moves + guard predicates, zero dependencies), from which the
   island derives its statechart and the server derives its check — keeping
   `core/domain` zod-only. Fallback if derivation proves brittle: a shared
   machine, adopted as an explicit, argued dependency decision. If a machine
   is ever shared, it may contain **domain states only** (columns + guards);
   UI states (drag lifecycle, optimism, undo) stay in a client-side layer
   around it — the failure mode is the server "knowing" about the mouse.

**Deferred to the spike + owner decision** (status: pending; everything above
is deliberately machine-agnostic — "island store" and "statechart" name the
rungs, not libraries):

- **(a) Rung-2 store library**: `zustand/vanilla` vs `@xstate/store`, judged
  on the same board-core sample — criteria: framework-agnosticism, TS
  inference, fit with the events-in seam, subscription granularity, size,
  devtools, migration path to full XState. Verdict from code, not opinion.
- **(b) Isomorphic-rules strategy**: transition table as data (recommended)
  vs a shared machine.

## Consequences

- **Honest cost: the seam taxes simple features.** A rung-1 core is extra
  files where `useQuery(actions.todos)` was two lines. Mitigation: rung 1 is
  scaffolder-generated re-export boilerplate, and uniformity is what removes
  agent guesswork — you pay a fixed small tax to make every feature look the
  same, instead of a variable large one when agents improvise topologies.
- **Enforcement surface grows.** New lint rules (event-suffix taxonomy, core
  purity bans, persistence bans, `setQueryData` confinement — see
  [frontend-lint-plan.md](../frontend-lint-plan.md) Phase 5) plus
  config-regression probes for each. Every normative rule in the architecture
  section ships an explicit TYPE/LINT/TEST/REVIEW+AI enforcement matrix.
- **The two-machines contract is only partially lintable.** The bans are
  mechanical; copying the *shape* of a server response into a store is
  semantic and stays a review + AI-tier check — acknowledged residual risk.
- **This narrows, not reverses, the earlier "no client event bus" decision.**
  The rationale against stringly-typed buses (coupling hidden from the
  dependency graph) stands; what is sanctioned is exactly the closed-union
  escape hatch that decision reserved, now with a proven need, an owner per
  event, and a views-never-touch-it rule.
- **The demo gains two exemplar boards** (personal = rung 2, team = rung 3
  with isomorphic column rules), two islands over one tasks subdomain —
  landing **after** the spike decides (a) and (b). Until then the demo's
  features remain rung 1, which is honest: no current feature fires a
  graduation trigger.
- The one-paragraph "Client state" rule in architecture.md §Frontend is
  superseded by the island-core model (rewritten in the same change as this
  ADR).
