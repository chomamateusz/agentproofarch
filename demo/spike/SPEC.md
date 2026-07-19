# Machine spike — shared spec (the fair fight)

Decision record: `island-core-grill-5.md` (variant A, two boards; transition
table vs shared machine resolved by this spike). This file is the contract both
sides of each comparison implement. Anything not specified here is an
implementation choice; anything specified here is asserted by the shared suite
or by the drift-proof and MUST behave identically across variants.

Ground rules (repo-wide, apply here too): no `any`, no `as` except `as const`,
no react import anywhere under `spike/` (test-enforced), cores are pure TS.
`spike/core-contract.ts` is the normative type source — variants import it,
never redeclare it.

Run everything with:

```bash
VITEST_SPIKE=1 npx vitest run --project spike
```

---

## Spike A — personal board (ladder rung 2: store)

Compares `zustand/vanilla` vs `@xstate/store` on the identical core.

### Variants and registration

- `spike/a-zustand/core.ts` — exports `createCore: CoreFactory` built on `zustand/vanilla`.
- `spike/a-xstate-store/core.ts` — exports `createCore: CoreFactory` built on `@xstate/store`.

Register by editing `spike/registry.ts`: import your factory and append a
`{ name, createCore }` entry to the `variants` array literal. The shared suite
(`spike/behavior.test.ts`) runs `describe.each` over that array — registration
is the whole integration step; do not touch the test file.

### Contract (normative types in `core-contract.ts`)

Events in, selectors out — the seam. `CoreFactory = (deps: CoreDeps) => CoreApi`.

- Events (closed union `BoardEvent`):
  `cardAdded {title, column}` · `cardMoved {cardId, toColumn, toIndex}` ·
  `cardRemoved {cardId}` · `undoRequested`.
- Selectors: `listColumns()` (the four `COLUMNS` in order), `cardsIn(column)`
  (cards of that column in column order), `canUndo()`.
- `getState(): BoardState` — plain, JSON-serializable data (deep-equal safe);
  never expose live internal store objects.
- `subscribe(listener)` — fires after every visible state change, returns an
  unsubscribe function; after unsubscribe the listener never fires again.
- `CoreDeps` injects everything impure: `gateway` (async persistence stand-in
  for the descriptor layer — NO TanStack in the spike) and `generateId`
  (card ids come from here, nowhere else — tests pin the generated ids).

### Behavior semantics

- **Optimistic apply**: a mutation event updates state synchronously in
  `send`, then issues exactly one gateway call
  (`cardAdded → addCard {id, title, column, index}` with `index` = append
  position; `cardMoved → moveCard`; `cardRemoved → removeCard`).
- **Commit**: gateway resolves `{ok: true}` → optimistic state stands and the
  op becomes the (single) undo target.
- **Rollback**: gateway resolves `{ok: false}` → state is restored deep-equal
  to the snapshot taken immediately before the optimistic apply
  (snapshot-restore recommended; whatever the mechanism, `getState()` must
  deep-equal the prior value). A failed op never becomes the undo target and
  never clears the existing one. The gateway returns `GatewayResult`, it never
  throws across the seam.
- **Undo (single level, inverse ops)**: `undoRequested` with `canUndo()`
  false is a no-op (no state change, no gateway call). Otherwise it applies
  and sends the inverse of the last committed op — itself optimistic with the
  same rollback rule:
  - `cardAdded` ⇢ `removeCard` of that id,
  - `cardMoved` ⇢ `moveCard` back to the prior column and prior index,
  - `cardRemoved` ⇢ `addCard` with the same id/title/column and the prior
    index (this is why `AddCardInput` carries `index`).
  A committed undo clears the undo slot (no redo); a rolled-back undo keeps it.
- **Edge cases**: `cardMoved`/`cardRemoved` with an unknown `cardId` is a
  no-op (no gateway call). `toIndex` clamps to the target column length.
  Moves within the same column (reorder) are legal. Personal board has no
  transition rules — any column to any column.
- **Out of scope**: overlapping in-flight mutations. The suite settles each
  gateway call before sending the next mutation; concurrent-op semantics are
  deliberately unspecified for the spike.

### Verdict criteria (from grill round 3 — judged from the code, per variant)

framework-agnosticism · TS inference quality (how much annotation the store
needs) · fit with the event seam (native events vs translated actions) ·
subscription granularity · core size/LOC · devtools story · migration path to
full XState.

---

## Spike B — team board rules (ladder rung 3: statechart)

Columns `todo → in-dev → review → done`. Rules:

- **R1** WIP limit per column: a move into a column that already holds
  `limits[column]` cards is rejected (`WipLimits` injected; absent entry =
  unlimited; the moved card itself never counts toward the target count).
- **R2** `done` is reachable only from `review`.
- **R3** a card may enter `review` only if it has visited `in-dev`
  (`TeamCard.visited` accumulates every column the card has ever entered,
  including its initial column).

Shared semantics: a move to the card's current column is allowed (identity
move, skips R1–R3). A move referencing an unknown `cardId` is rejected.
Everything R1–R3 do not forbid is allowed (backward moves included). When a
move is rejected, the reported rule follows this precedence:
`unknown-card → done-only-from-review → review-requires-in-dev → wip-limit`.
Verdict shape: `MoveVerdict` in `core-contract.ts`.

### Deliverable per variant

1. **ONE source of truth** for the rules — a single module; no rule text may
   exist twice.
2. **Client machine** enforcing them as transition guards (immediate UX:
   blocked drop + reason).
3. **Server-side check** — a pure `MoveCheck` function
   `(state, move, limits) => MoveVerdict` a server use-case would call —
   derived from or evaluating the same single source.
4. **DRIFT-PROOF** — a property-style test per variant iterating all
   (state, event) pairs of a bounded domain, asserting for every pair:
   client allowance `===` server allowance, and when both reject, the same
   `rule`. The enumeration must be non-vacuous: assert that each of the four
   rejection rules fires at least once and at least one move is allowed.
   Suggested bounded domain (not mandated, but cover at least this much):
   boards of 1–2 cards × each card in every column × visited-sets consistent
   with reachability × limits ∈ `{}` / `{'in-dev': 1}` / `{review: 1}`;
   events = every card × every target column.

### Variants

- `spike/b-table/` — **transition table as data** (grill-5 recommendation):
  a plain object in domain-land (zero deps) declaring allowed moves +
  guard predicates; from it derive (a) the XState machine with guards for the
  client, (b) the pure `MoveCheck` for the server.
- `spike/b-machine/` — **one shared machine**: a single XState machine used by
  the client actor AND evaluated server-side through the pure transition API
  (`getNextSnapshot`-style, no actor on the server) to produce `MoveCheck`.

Hygiene rule for any shared machine (grill-5, decision 2): it may contain
**domain states only** (columns + guards). Drag lifecycle, optimism, undo —
client-side wrapper, never in the shared machine. The spike verdict must note
where each variant makes this violation easy or hard.

### Verdict criteria

single-source fidelity (can the two enforcement sites drift silently?) ·
derivation fragility (does the table→machine mapping survive rule #4?) ·
`core/domain` purity cost (which deps land in domain-land) · server-side
ergonomics · drift-proof strength.
