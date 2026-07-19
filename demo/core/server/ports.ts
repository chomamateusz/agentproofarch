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

export interface IdGenerator {
  nextId(): string;
}

export interface Clock {
  nowIso(): string;
}
