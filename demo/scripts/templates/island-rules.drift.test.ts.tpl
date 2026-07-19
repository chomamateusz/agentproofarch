import { describe, expect, it } from 'vitest';

import { evaluate__SINGULAR_PASCAL__Move } from './machine.js';
import {
  canApply__SINGULAR_PASCAL__Move,
  PHASES,
  type RuleId,
  type WipLimits,
  type __SINGULAR_PASCAL__Move,
  type __SINGULAR_PASCAL__State,
  type __SINGULAR_PASCAL__Verdict,
} from './rules.js';

/**
 * Drift proof (property test): the DERIVED machine oracle (core/machine.ts) and
 * the direct table walk (core/rules.ts) both derive from the SAME transition
 * table, so they must agree on EVERY (state, event) pair. This test fails CI the
 * moment the derivation generator diverges from the table — the isomorphic-rules
 * guarantee. It enumerates the full product, INCLUDING the WIP=1 edge.
 */

interface Scenario {
  readonly state: __SINGULAR_PASCAL__State;
  readonly move: __SINGULAR_PASCAL__Move;
  readonly limits: WipLimits;
}

const singleItemStates: readonly __SINGULAR_PASCAL__State[] = PHASES.map((phase) => ({
  items: [{ id: 'a', phase }],
}));

// A second occupant so the WIP=1 edge is reachable: the target phase can be full.
const occupiedStates: readonly __SINGULAR_PASCAL__State[] = PHASES.flatMap((occ) =>
  PHASES.map((phase): __SINGULAR_PASCAL__State => ({
    items: [
      { id: 'occ', phase: occ },
      { id: 'a', phase },
    ],
  })),
);

const states: readonly __SINGULAR_PASCAL__State[] = [...singleItemStates, ...occupiedStates];

// {} = no limits; each single-phase map makes that phase saturate at capacity 1
// (the WIP=1 edge the spike learnings call out).
const limitOptions: readonly WipLimits[] = [{}, ...PHASES.map((phase): WipLimits => ({ [phase]: 1 }))];

const movesFor = (state: __SINGULAR_PASCAL__State): readonly __SINGULAR_PASCAL__Move[] => [
  ...state.items.flatMap((item) => PHASES.map((to): __SINGULAR_PASCAL__Move => ({ itemId: item.id, to }))),
  // A ghost item exercises the pre-table 'unknown-item' verdict.
  { itemId: 'ghost', to: 'done' },
];

const scenarios: readonly Scenario[] = states.flatMap((state) =>
  limitOptions.flatMap((limits) => movesFor(state).map((move): Scenario => ({ state, move, limits }))),
);

const disagree = (a: __SINGULAR_PASCAL__Verdict, b: __SINGULAR_PASCAL__Verdict): boolean => {
  if (a.allowed !== b.allowed) return true;
  return !a.allowed && !b.allowed && a.rule !== b.rule;
};

describe('__SINGULAR_KEBAB__ rules drift-proof', () => {
  it('derived machine and table check agree on every (state, event) pair', () => {
    expect(scenarios.length).toBeGreaterThan(0);
    const mismatches = scenarios.filter(({ state, move, limits }) =>
      disagree(
        evaluate__SINGULAR_PASCAL__Move(state, move, limits),
        canApply__SINGULAR_PASCAL__Move(state, move, limits),
      ),
    );
    expect(mismatches).toEqual([]);
  });

  it('exercises every rejection rule and at least one allowance (non-vacuity)', () => {
    const seenRules = new Set<RuleId>();
    let allowed = 0;
    for (const { state, move, limits } of scenarios) {
      const verdict = canApply__SINGULAR_PASCAL__Move(state, move, limits);
      if (verdict.allowed) allowed += 1;
      else seenRules.add(verdict.rule);
    }
    const required: readonly RuleId[] = ['unknown-item', 'done-requires-active', 'wip-limit'];
    for (const rule of required) expect(seenRules.has(rule)).toBe(true);
    expect(allowed).toBeGreaterThan(0);
  });

  // <<EXTENSION POINT — prove the harness catches drift>>
  // Add a deliberately DRIFTED machine (e.g. a hand-written one that DROPS a guard
  // on one transition) and assert `disagree` flags at least one scenario — the
  // b-table spike does this to show the property test is not vacuous. Keep the
  // drifted machine hand-written and INLINE (hoisting its transitions into consts
  // widens their literal types and XState's config type rejects them).
});
