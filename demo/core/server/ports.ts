import type { BoardId, Card, Member, Membership, StaffRole, Tenant, TenantDomain, Todo } from '#core/domain/index.js';

/**
 * Ports: interfaces the core depends on, implemented in `adapters/`.
 * The core never knows which database, auth provider or platform sits behind them.
 */

export interface TodoRepository {
  listByTenant(tenantId: string): Promise<Todo[]>;
  create(todo: Todo): Promise<void>;
}

/**
 * The end-customer roster, tenant-scoped. Every method requires `tenantId` (the
 * tenant-scoping rule), so a member id can never be read or mutated across
 * tenants. `deleteByTenantAndId` returns the number of rows removed so the
 * removal use-case can prove the cascade (and distinguish a real delete from a
 * no-op when the id belongs to another tenant).
 */
export interface MemberRepository {
  listByTenant(tenantId: string): Promise<Member[]>;
  findByEmail(tenantId: string, email: string): Promise<Member | null>;
  findByTenantAndId(tenantId: string, id: string): Promise<Member | null>;
  create(member: Member): Promise<void>;
  update(member: Member): Promise<void>;
  deleteByTenantAndId(tenantId: string, id: string): Promise<number>;
}

/**
 * A single card's new column + 0-based position, applied tenant-scoped.
 * `visited` is set only for the moving card (the one whose column changed), so
 * the reorder pass leaves every other card's history untouched.
 */
export interface CardPositionUpdate {
  id: string;
  column: string;
  position: number;
  visited?: readonly string[];
}

export interface CardRepository {
  listByTenant(tenantId: string, board: BoardId): Promise<Card[]>;
  create(card: Card): Promise<void>;
  updatePositions(
    tenantId: string,
    board: BoardId,
    updates: readonly CardPositionUpdate[],
  ): Promise<void>;
}

export interface TenantDomainRepository {
  findByDomain(domain: string): Promise<TenantDomain | null>;
  listVerifiedDomains(): Promise<TenantDomain[]>;
}

export type TenantLookup = { tenantId: string } | { tenantSlug: string };

export interface TenantRepository {
  findById(tenantId: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  createTenant(input: { id: string; slug: string; name: string; createdAt: string }): Promise<Tenant>;
  createOwnerGrant(input: {
    id: string;
    tenantId: string;
    userId: string;
    staffRole: Extract<StaffRole, 'owner'>;
  }): Promise<void>;
  /** Offboarding: deletes the tenant row; every tenant-owned aggregate cascades. */
  deleteTenant(tenantId: string): Promise<void>;
}

export interface TenantAccessReader {
  listTenantsForStaff(userId: string): Promise<Membership[]>;
  findStaffGrant(userId: string, lookup: TenantLookup): Promise<Membership | null>;
  findMember(userId: string, tenantId: string): Promise<Member | null>;
}

/** Established authenticated session, before tenant resolution. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string;
}

export interface AuthPort {
  /** Returns the authenticated user for a request, or null when anonymous. */
  getAuthenticatedUser(requestHeaders: Headers): Promise<AuthenticatedUser | null>;
}

export interface HealthPort {
  pingDatabase(): Promise<boolean>;
}

/** Whether a tenant domain points at the deploy's public target, with a human detail. */
export interface DomainCheck {
  readonly resolved: boolean;
  readonly detail: string;
}

/**
 * Provisioning + verification for tenant custom domains. Selected by
 * `DOMAIN_PROVISIONER` in the composition root, per deploy target:
 *   - `caddy` (self-host): `provision`/`remove` are no-ops — Caddy issues certs
 *     on demand via the `ask` endpoint — and `check` is a DNS lookup that the
 *     domain resolves to the configured target (`SELF_HOST_TARGET_CNAME`/`_IP`).
 *   - `noop` (dev/default): every method resolves without side effects.
 * A Vercel Domains API implementation is the deferred US-020 sibling.
 */
export interface DomainPort {
  provision(domain: string): Promise<void>;
  check(domain: string): Promise<DomainCheck>;
  remove(domain: string): Promise<void>;
}

export interface IdGenerator {
  nextId(): string;
}

export interface Clock {
  nowIso(): string;
}
