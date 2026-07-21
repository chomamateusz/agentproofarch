import { describe, expect, it } from 'vitest';

import { serverEnvSchema } from '#core/server/config.js';

import { selectDomainPort } from './composition.js';
import type { Env } from './env.js';

// selectDomainPort only — never createDeps here: the full graph constructs a
// real Better Auth instance whose init eagerly queries tenant_domains, and the
// check runner has no database (CI-only unhandled rejection, 2026-07-21).
const env = (over: Partial<Env>): Env => ({
  ...serverEnvSchema.parse({}),
  APP_BASE_URL: 'http://localhost:47100',
  ...over,
});

describe('selectDomainPort', () => {
  it('wires the caddy DomainPort when DOMAIN_PROVISIONER=caddy', async () => {
    const port = selectDomainPort(env({ DOMAIN_PROVISIONER: 'caddy' }));
    // No target configured → the caddy port rejects without any DNS lookup,
    // which is enough to prove the caddy branch (not noop) was selected.
    const result = await port.check('shop.acme.com');
    expect(result.resolved).toBe(false);
    expect(result.detail).toContain('SELF_HOST_TARGET');
  });

  it('wires the noop DomainPort by default', async () => {
    const port = selectDomainPort(env({}));
    expect((await port.check('anything.test')).resolved).toBe(true);
  });
});
