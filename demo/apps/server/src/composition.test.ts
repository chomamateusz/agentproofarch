import { describe, expect, it } from 'vitest';

import { serverEnvSchema } from '#core/server/config.js';

import { createDeps } from './composition.js';
import type { Env } from './env.js';

const env = (over: Partial<Env>): Env => ({
  ...serverEnvSchema.parse({}),
  APP_BASE_URL: 'http://localhost:47100',
  ...over,
});

describe('createDeps — domainPort selection', () => {
  it('wires the caddy DomainPort when DOMAIN_PROVISIONER=caddy', async () => {
    const deps = createDeps(env({ DOMAIN_PROVISIONER: 'caddy' }));
    // No target configured → the caddy port rejects without any DNS lookup,
    // which is enough to prove the caddy branch (not noop) was selected.
    const result = await deps.domainPort.check('shop.acme.com');
    expect(result.resolved).toBe(false);
    expect(result.detail).toContain('SELF_HOST_TARGET');
  });

  it('wires the noop DomainPort by default', async () => {
    const deps = createDeps(env({}));
    expect((await deps.domainPort.check('anything.test')).resolved).toBe(true);
  });

  it('provides the injected id and clock primitives', () => {
    const deps = createDeps(env({}));
    expect(typeof deps.ids.nextId()).toBe('string');
    expect(deps.ids.nextId()).not.toBe(deps.ids.nextId());
    expect(deps.clock.nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
