import { describe, expect, it } from 'vitest';

import type { Membership, TenantDomain } from '@core/domain/index.js';

import type { MembershipReader, TenantDomainRepository } from '../ports.js';
import { resolveIdentity } from './resolve-identity.js';

const user = { userId: 'u1', email: 'demo@example.com', name: 'Demo' };

const acme: Membership = {
  tenant: { id: 't-acme', slug: 'acme', name: 'Acme Inc' },
  role: 'owner',
};

const fakeMemberships = (memberships: Membership[]): MembershipReader => ({
  listForUser: async () => memberships,
  findForUserInTenantBySlug: async (_userId, slug) =>
    memberships.find((m) => m.tenant.slug === slug) ?? null,
  findForUserInTenantById: async (_userId, id) =>
    memberships.find((m) => m.tenant.id === id) ?? null,
});

const fakeDomains = (domains: TenantDomain[]): TenantDomainRepository => ({
  findByDomain: async (domain) => domains.find((d) => d.domain === domain) ?? null,
});

const deps = (memberships: Membership[], domains: TenantDomain[] = []) => ({
  memberships: fakeMemberships(memberships),
  tenantDomains: fakeDomains(domains),
  baseDomain: 'localhost',
});

describe('resolveIdentity', () => {
  it('rejects anonymous requests', async () => {
    const result = await resolveIdentity(null, { host: 'localhost', tenantHeader: null }, deps([]));
    expect(result).toMatchObject({ ok: false, error: { code: 'unauthorized' } });
  });

  it('resolves tenant from subdomain', async () => {
    const result = await resolveIdentity(
      user,
      { host: 'acme.localhost:4711', tenantHeader: null },
      deps([acme]),
    );
    expect(result).toMatchObject({ ok: true, value: { tenantSlug: 'acme', role: 'owner' } });
  });

  it('resolves tenant from X-Tenant header on the base domain', async () => {
    const result = await resolveIdentity(
      user,
      { host: 'localhost:4711', tenantHeader: 'acme' },
      deps([acme]),
    );
    expect(result).toMatchObject({ ok: true, value: { tenantId: 't-acme' } });
  });

  it('resolves tenant from a custom domain and requires membership', async () => {
    const domain: TenantDomain = {
      id: 'd1',
      tenantId: 't-acme',
      domain: 'todo.example.com',
      kind: 'custom',
      verified: true,
    };
    const okResult = await resolveIdentity(
      user,
      { host: 'todo.example.com', tenantHeader: null },
      deps([acme], [domain]),
    );
    expect(okResult).toMatchObject({ ok: true, value: { tenantId: 't-acme' } });

    const denied = await resolveIdentity(
      user,
      { host: 'todo.example.com', tenantHeader: null },
      deps([], [domain]),
    );
    expect(denied).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  });

  it('returns tenant-less identity on the bare base domain', async () => {
    const result = await resolveIdentity(
      user,
      { host: 'localhost:4711', tenantHeader: null },
      deps([acme]),
    );
    expect(result).toMatchObject({ ok: true, value: { tenantId: null } });
  });

  it('rejects unknown tenants', async () => {
    const result = await resolveIdentity(
      user,
      { host: 'globex.localhost', tenantHeader: null },
      deps([acme]),
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'tenant_not_found' } });
  });
});
