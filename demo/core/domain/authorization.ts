import type { Identity } from './identity.js';

/**
 * The capability model: one entry per aggregate action the tenant-scoped
 * use-cases perform. A use-case names its capability; `decide` answers whether a
 * principal holds it. The list is closed — a new use-case that names a
 * capability absent here does not typecheck, which is the intended nudge.
 */
export const CAPABILITIES = [
  'todo:read',
  'todo:write',
  'card:read',
  'card:write',
  'member:read',
  'member:write',
  'member:remove',
  'member:export',
  'tenant:create',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * The principal an identity acts as. Staff (owner|admin) and end-customer
 * members are the two populations from §Identity and multi-tenancy; a `visitor`
 * is any authenticated identity with neither — no staff grant and no membership,
 * which is exactly the tenant-less identity (base domain, no tenant selected).
 */
export const PRINCIPALS = ['staff', 'member', 'visitor'] as const;

export type Principal = (typeof PRINCIPALS)[number];

export type Verdict = { allowed: true } | { allowed: false; reason: string };

export const principalOf = (identity: Identity): Principal => {
  if (identity.staffRole !== null) return 'staff';
  if (identity.memberId !== null) return 'member';
  return 'visitor';
};

/**
 * The whole policy as data: a capability lists exactly the principals it is
 * granted to. Default-deny — a principal absent from the list is denied, there
 * is no wildcard-allow. `Record<Capability, …>` makes it a compile error to add
 * a capability without deciding, here, who may exercise it.
 *
 * Baseline demo policy: staff (owner|admin) get read+write on every tenant-scoped
 * aggregate; members are full collaborators on the boards (todos, cards); tenant
 * administration is not a member capability. `tenant:create` is tenant-less
 * self-service (the caller becomes owner), so a visitor holds it; a member of one
 * tenant may not spin up others. (Listing one's own memberships is a self-scoped
 * read gated by authentication, not a capability — see §Authorization.)
 *
 * The `member:*` capabilities are STAFF-ONLY (owner|admin), deliberately not
 * granted to the `member` principal: members are the END CUSTOMERS this
 * aggregate is about, managed BY tenant staff, not editors of the customer roster
 * (PRD §3.4, FR-22 — owners/admins export and remove members). Granting a member
 * `member:read` would let one customer enumerate the tenant's customer list; the
 * self-scoped read a customer legitimately gets (their own profile) rides
 * `/api/me`, which carries no capability. `member:remove` is split from
 * `member:write` so a future policy can let admins edit profiles while reserving
 * destructive removal for owners without reopening the capability set.
 */
const GRANTS: Record<Capability, readonly Principal[]> = {
  'todo:read': ['staff', 'member'],
  'todo:write': ['staff', 'member'],
  'card:read': ['staff', 'member'],
  'card:write': ['staff', 'member'],
  'member:read': ['staff'],
  'member:write': ['staff'],
  'member:remove': ['staff'],
  'member:export': ['staff'],
  'tenant:create': ['staff', 'visitor'],
};

export const decide = (identity: Identity, capability: Capability): Verdict => {
  const principal = principalOf(identity);
  return GRANTS[capability].includes(principal)
    ? { allowed: true }
    : { allowed: false, reason: `${capability} is not permitted for ${principal}` };
};
