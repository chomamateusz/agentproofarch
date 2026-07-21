import type { BoardId, Card, Member, Membership, StaffMember, StaffRole, Tenant, TenantDomain, Todo } from '#core/domain/index.js';

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
  /** Verified-only lookup by host — tenant resolution and the on-demand-TLS ask. */
  findByDomain(domain: string): Promise<TenantDomain | null>;
  listVerifiedDomains(): Promise<TenantDomain[]>;
  /** The tenant's attached domains (any verification state), for the settings roster. */
  listByTenant(tenantId: string): Promise<TenantDomain[]>;
  /** Global uniqueness check (a host attaches to at most one tenant), any state. */
  findAnyByDomain(domain: string): Promise<TenantDomain | null>;
  /** Tenant-scoped lookup (any verification state) for check/remove. */
  findByTenantAndDomain(tenantId: string, domain: string): Promise<TenantDomain | null>;
  add(input: {
    id: string;
    tenantId: string;
    domain: string;
    kind: TenantDomain['kind'];
    verified: boolean;
  }): Promise<TenantDomain>;
  /** Flip the verified flag after a provisioner check; null when the row is gone. */
  setVerified(tenantId: string, domain: string, verified: boolean): Promise<TenantDomain | null>;
  /** Tenant-scoped delete; the row count is the proof (0 = not this tenant's domain). */
  removeByTenantAndDomain(tenantId: string, domain: string): Promise<number>;
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

/** One raw `tenant_admins` grant, before the account join that yields email/name. */
export interface StaffGrant {
  id: string;
  userId: string;
  role: StaffRole;
}

/**
 * The tenant-staff roster aggregate (FR-8). Every method is tenant-scoped on
 * `tenant_admins` so a grant can never be read, minted or revoked across tenants.
 * `listByTenant` joins the global account for the human-readable email/name;
 * `countOwners` backs the last-owner lockout guard; `grant` is insert-only
 * (idempotency is decided in the use-case, which checks `findGrant` first).
 */
export interface StaffRepository {
  listByTenant(tenantId: string): Promise<StaffMember[]>;
  findGrant(tenantId: string, userId: string): Promise<StaffGrant | null>;
  countOwners(tenantId: string): Promise<number>;
  grant(input: { id: string; tenantId: string; userId: string; role: StaffRole }): Promise<void>;
  revoke(tenantId: string, userId: string): Promise<number>;
}

/** One global account, resolved from the auth `user` table for an FR-8 grant. */
export interface DirectoryUser {
  userId: string;
  email: string;
  name: string;
}

/**
 * Read-only lookup into the global account directory (the auth `user` table). FR-8
 * grants admin access to a user who must ALREADY have an account — there are no
 * invitations (post-MVP) — so `grantAdmin` resolves the email here and returns
 * `not_found` when it has no account. Distinct from `AuthPort` (session → identity):
 * this is an unauthenticated-by-session, email → account directory read.
 */
export interface UserDirectory {
  findByEmail(email: string): Promise<DirectoryUser | null>;
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

/**
 * One outbound email. `link` is the optional primary-action URL a transactional
 * mail carries (a magic link, a verification link); the smtp transport embeds it
 * in `text`/`html` and ignores the field, while the dev transport captures it so
 * a link can be surfaced without real delivery. Keeping the port at `sendMail`
 * makes the magic link ONE consumer of the seam, not the port's shape.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  link?: string;
}

export interface EmailPort {
  sendMail(message: EmailMessage): Promise<void>;
}

/**
 * The dev/CI email transport's capture side (US-026 AC: no real delivery — the
 * link is surfaced instead). Present in the composition ONLY when
 * `EMAIL_TRANSPORT=dev`, so the dev-only magic-link retrieval route is mounted
 * exclusively off this handle and never exists on a real deploy.
 */
export interface DevMailbox {
  /** The most recent captured action link for an address, or null if none. */
  lastLinkFor(email: string): string | null;
}

export interface IdGenerator {
  nextId(): string;
}

export interface Clock {
  nowIso(): string;
}
