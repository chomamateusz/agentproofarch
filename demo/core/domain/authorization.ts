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
  'staff:read',
  'staff:grant',
  'staff:revoke',
  'tenant:create',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * The principal an identity acts as. The two staff roles are DISTINCT principals
 * (`owner`, `admin`) — FR-8 is the first capability where they diverge: only an
 * owner may grant/revoke admin access, while both share every collaborative and
 * customer-management capability. `member` is an end-customer membership (no
 * staff grant); a `visitor` is any authenticated identity with neither — no staff
 * grant and no membership, which is exactly the tenant-less identity (base
 * domain, no tenant selected).
 */
export const PRINCIPALS = ['owner', 'admin', 'member', 'visitor'] as const;

export type Principal = (typeof PRINCIPALS)[number];

/** The staff principals — the `owner|admin` grant that §Identity calls "staff". */
export const STAFF_PRINCIPALS = ['owner', 'admin'] as const satisfies readonly Principal[];

export type Verdict = { allowed: true } | { allowed: false; reason: string };

export const principalOf = (identity: Identity): Principal => {
  if (identity.staffRole === 'owner') return 'owner';
  if (identity.staffRole === 'admin') return 'admin';
  if (identity.memberId !== null) return 'member';
  return 'visitor';
};

/**
 * The whole policy as data: a capability lists exactly the principals it is
 * granted to. Default-deny — a principal absent from the list is denied, there
 * is no wildcard-allow. `Record<Capability, …>` makes it a compile error to add
 * a capability without deciding, here, who may exercise it.
 *
 * Baseline demo policy: staff (owner AND admin) get read+write on every
 * tenant-scoped aggregate; members are full collaborators on the boards (todos,
 * cards); tenant administration is not a member capability. `tenant:create` is
 * tenant-less self-service (the caller becomes owner), so a visitor holds it; a
 * member of one tenant may not spin up others. (Listing one's own memberships is
 * a self-scoped read gated by authentication, not a capability — see
 * §Authorization.)
 *
 * The `member:*` capabilities are STAFF-ONLY (owner+admin), deliberately not
 * granted to the `member` principal: members are the END CUSTOMERS this
 * aggregate is about, managed BY tenant staff, not editors of the customer roster
 * (PRD §3.4, FR-22 — owners/admins export and remove members). Granting a member
 * `member:read` would let one customer enumerate the tenant's customer list; the
 * self-scoped read a customer legitimately gets (their own profile) rides
 * `/api/me`, which carries no capability. `member:remove` is split from
 * `member:write` so a future policy can let admins edit profiles while reserving
 * destructive removal for owners without reopening the capability set.
 *
 * The `staff:*` capabilities are the FR-8 admin-grant surface — the first place
 * `owner` and `admin` diverge. `staff:read` (list the staff roster) is granted to
 * BOTH staff roles, but `staff:grant`/`staff:revoke` are OWNER-ONLY: an admin can
 * run the tenant but cannot mint or remove other staff. This is why staff is two
 * principals, not one — an `admin` in the list below is simply absent from the
 * grant/revoke rows, and default-deny does the rest.
 */
const GRANTS: Record<Capability, readonly Principal[]> = {
  'todo:read': ['owner', 'admin', 'member'],
  'todo:write': ['owner', 'admin', 'member'],
  'card:read': ['owner', 'admin', 'member'],
  'card:write': ['owner', 'admin', 'member'],
  'member:read': ['owner', 'admin'],
  'member:write': ['owner', 'admin'],
  'member:remove': ['owner', 'admin'],
  'member:export': ['owner', 'admin'],
  'staff:read': ['owner', 'admin'],
  'staff:grant': ['owner'],
  'staff:revoke': ['owner'],
  'tenant:create': ['owner', 'admin', 'visitor'],
};

export const decide = (identity: Identity, capability: Capability): Verdict => {
  const principal = principalOf(identity);
  return GRANTS[capability].includes(principal)
    ? { allowed: true }
    : { allowed: false, reason: `${capability} is not permitted for ${principal}` };
};
