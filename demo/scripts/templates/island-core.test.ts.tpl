import { describe, expect, it } from 'vitest';

import { send, __SINGULAR_CAMEL__Selectors } from './index.js';

/**
 * Core seam test — exercises the __SINGULAR_KEBAB__ island core WITHOUT rendering
 * (no React). At RUNG 1 the core is a thin re-export with a stubbed `send`, so
 * there is little behavior to assert; this file is the HOME for the machine's
 * unit tests once the island graduates.
 */
describe('__SINGULAR_KEBAB__ island core', () => {
  it('exposes its read seam as selectors', () => {
    expect(__SINGULAR_CAMEL__Selectors).toHaveProperty('list');
  });

  it('accepts the example intent (rung 1: send is a typed stub)', () => {
    expect(() => send({ type: 'refreshRequested' })).not.toThrow();
  });

  // <<EXTENSION POINT — machine tests>>
  // Rung 2 (island store): assert an intent transitions state and that selectors
  //   read it back — e.g. send(cardMoveRequested) reorders the column.
  // Rung 3 (statechart): assert guards make illegal transitions impossible —
  //   e.g. a move violating a domain rule is rejected and state is unchanged.
  // Drive the machine directly here; never render to test the core.
});
