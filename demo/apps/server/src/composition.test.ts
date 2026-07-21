import { describe, expect, it } from 'vitest';

import { serverEnvSchema } from '#core/server/config.js';

import { selectDomainPort, selectEmailPort, selectGoogleSettings } from './composition.js';
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

describe('selectEmailPort', () => {
  it('wires the dev transport (with a capture mailbox) by default', () => {
    const port = selectEmailPort(env({}));
    expect(port.devMailbox).not.toBeNull();
  });

  it('wires the smtp transport (no dev mailbox) when configured', () => {
    const port = selectEmailPort(
      env({ EMAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.com', SMTP_USER: 'u', SMTP_PASS: 'p' }),
    );
    expect(port.devMailbox).toBeNull();
  });

  it('fails fast when EMAIL_TRANSPORT=smtp is missing its credentials', () => {
    expect(() => selectEmailPort(env({ EMAIL_TRANSPORT: 'smtp' }))).toThrow(/SMTP_HOST/);
  });
});

describe('selectGoogleSettings', () => {
  it('is undefined unless BOTH id and secret are present', () => {
    expect(selectGoogleSettings(env({}))).toBeUndefined();
    expect(selectGoogleSettings(env({ GOOGLE_CLIENT_ID: 'id' }))).toBeUndefined();
    expect(selectGoogleSettings(env({ GOOGLE_CLIENT_SECRET: 'secret' }))).toBeUndefined();
  });

  it('wires Google when both keys are present', () => {
    const google = selectGoogleSettings(env({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }));
    expect(google).toEqual({ clientId: 'id', clientSecret: 'secret' });
  });
});
