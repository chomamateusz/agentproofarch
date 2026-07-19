import { describe, expect, it } from 'vitest';

import { send, __SINGULAR_CAMEL__Selectors } from './index.js';
import {
  create__SINGULAR_PASCAL__Store,
  type GatewayResult,
  type __SINGULAR_PASCAL__Gateway,
} from './store.js';

/**
 * Core seam test — exercises the __SINGULAR_KEBAB__ island core WITHOUT rendering
 * (no React). RUNG 2 (island store): the seam assertions below stay RED until the
 * server read and the gateway are bound (see the checklist); the store block
 * drives the store directly with a fake gateway and is green immediately.
 */
describe('__SINGULAR_KEBAB__ island core seam', () => {
  it('exposes its read seam as selectors', () => {
    expect(__SINGULAR_CAMEL__Selectors).toHaveProperty('list');
  });

  it('accepts the example intent without throwing', () => {
    expect(() => send({ type: 'refreshRequested' })).not.toThrow();
  });
});

// A fake gateway: the store is pure over its injected deps, so a test drives it
// with an in-memory gateway — no network. Pass `ok: false` to exercise rollback.
const stubGateway = (ok: boolean): __SINGULAR_PASCAL__Gateway => {
  const result: GatewayResult = ok ? { ok: true } : { ok: false, error: 'stub failure' };
  return {
    addItem: () => Promise.resolve(result),
    moveItem: () => Promise.resolve(result),
    removeItem: () => Promise.resolve(result),
  };
};

// Flush the store's async gateway effect (an optimistic apply settles on the next
// macrotask) so an assertion can observe the committed state.
const flush = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('__SINGULAR_PASCAL__ store (rung 2)', () => {
  it('optimistically applies an add before the gateway settles', () => {
    const store = create__SINGULAR_PASCAL__Store({
      gateway: stubGateway(true),
      generateId: () => 'id-1',
    });
    store.send({ type: 'itemAddRequested', title: 'first' });
    expect(store.selectors.items().map((item) => item.title)).toEqual(['first']);
  });

  it('offers undo once the add commits', async () => {
    const store = create__SINGULAR_PASCAL__Store({
      gateway: stubGateway(true),
      generateId: () => 'id-1',
    });
    store.send({ type: 'itemAddRequested', title: 'first' });
    expect(store.selectors.canUndo()).toBe(false);
    await flush();
    expect(store.selectors.canUndo()).toBe(true);
  });

  // <<EXTENSION POINT — store tests>>
  // Assert rollback: with `stubGateway(false)`, an optimistic apply reverts after
  // `flush()` and the selector reads the pre-op state. Assert undo replays the
  // inverse gateway call. Drive the store directly here; never render to test it.
});
