import { describe, expect, it } from 'vitest';

import { membershipSchema, tenantDomainSchema, tenantSchema } from './tenant.js';

describe('tenantSchema', () => {
  const valid = { id: 't1', slug: 'acme', name: 'Acme Inc' };

  it('parses a valid tenant', () => {
    expect(tenantSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a missing field', () => {
    expect(tenantSchema.safeParse({ id: 't1', slug: 'acme' }).success).toBe(false);
  });

  it('rejects a non-string field', () => {
    expect(tenantSchema.safeParse({ ...valid, name: 42 }).success).toBe(false);
  });
});

describe('membershipSchema', () => {
  it('parses a valid membership', () => {
    const valid = { tenant: { id: 't1', slug: 'acme', name: 'Acme Inc' }, staffRole: 'owner' };
    expect(membershipSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an unknown staff role', () => {
    const invalid = { tenant: { id: 't1', slug: 'acme', name: 'Acme Inc' }, staffRole: 'guest' };
    expect(membershipSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('tenantDomainSchema', () => {
  const valid = {
    id: 'd1',
    tenantId: 't1',
    domain: 'acme.example.com',
    kind: 'custom',
    verified: true,
  };

  it('parses a valid tenant domain', () => {
    expect(tenantDomainSchema.parse(valid)).toEqual(valid);
  });

  it('accepts the subdomain kind', () => {
    expect(tenantDomainSchema.parse({ ...valid, kind: 'subdomain' }).kind).toBe('subdomain');
  });

  it('rejects an unknown kind', () => {
    expect(tenantDomainSchema.safeParse({ ...valid, kind: 'apex' }).success).toBe(false);
  });

  it('rejects a non-boolean verified', () => {
    expect(tenantDomainSchema.safeParse({ ...valid, verified: 'yes' }).success).toBe(false);
  });
});
