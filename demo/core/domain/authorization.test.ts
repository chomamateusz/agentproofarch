import { describe, expect, it } from 'vitest';

import {
  CAPABILITIES,
  decide,
  PRINCIPALS,
  principalOf,
  type Capability,
  type Identity,
  type Principal,
  type StaffRole,
} from './index.js';

const asStaff = (staffRole: StaffRole): Identity => ({
  userId: 'u1',
  email: 'staff@example.com',
  name: 'Staff',
  tenantId: 't-acme',
  tenantSlug: 'acme',
  tenantName: 'Acme Inc',
  staffRole,
  memberId: null,
});

const asMember: Identity = {
  userId: 'u2',
  email: 'member@example.com',
  name: 'Member',
  tenantId: 't-acme',
  tenantSlug: 'acme',
  tenantName: 'Acme Inc',
  staffRole: null,
  memberId: 'm-1',
};

const asVisitor: Identity = {
  userId: 'u3',
  email: 'visitor@example.com',
  name: 'Visitor',
  tenantId: null,
  tenantSlug: null,
  tenantName: null,
  staffRole: null,
  memberId: null,
};

const identityFor: Record<Principal, Identity> = {
  staff: asStaff('owner'),
  member: asMember,
  visitor: asVisitor,
};

// The policy table restated independently of the implementation's GRANTS map —
// Record<Capability, Record<Principal, boolean>> is exhaustive by construction,
// so a new capability or principal fails to compile until this table decides it.
const EXPECTED: Record<Capability, Record<Principal, boolean>> = {
  'todo:read': { staff: true, member: true, visitor: false },
  'todo:write': { staff: true, member: true, visitor: false },
  'card:read': { staff: true, member: true, visitor: false },
  'card:write': { staff: true, member: true, visitor: false },
  'tenant:create': { staff: true, member: false, visitor: true },
};

describe('principalOf', () => {
  it('reads owner and admin as staff', () => {
    expect(principalOf(asStaff('owner'))).toBe('staff');
    expect(principalOf(asStaff('admin'))).toBe('staff');
  });

  it('reads a membership without a staff grant as member', () => {
    expect(principalOf(asMember)).toBe('member');
  });

  it('reads a tenant-less identity as visitor', () => {
    expect(principalOf(asVisitor)).toBe('visitor');
  });
});

describe('decide — exhaustive capability × principal matrix', () => {
  for (const capability of CAPABILITIES) {
    for (const principal of PRINCIPALS) {
      const expected = EXPECTED[capability][principal];
      it(`${principal} ${expected ? 'may' : 'may NOT'} ${capability}`, () => {
        expect(decide(identityFor[principal], capability).allowed).toBe(expected);
      });
    }
  }

  it('carries a reason on every denial and none on a grant', () => {
    const denied = decide(asVisitor, 'card:write');
    expect(denied).toEqual({ allowed: false, reason: 'card:write is not permitted for visitor' });
    expect(decide(asStaff('admin'), 'card:write')).toEqual({ allowed: true });
  });

  it('grants staff every capability (staff is the superset principal)', () => {
    for (const capability of CAPABILITIES) {
      expect(decide(asStaff('owner'), capability).allowed).toBe(true);
    }
  });
});
