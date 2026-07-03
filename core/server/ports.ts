import type { Membership, TenantDomain, Todo } from '@core/domain/index.js';

/**
 * Ports: interfaces the core depends on, implemented in `adapters/`.
 * The core never knows which database, auth provider or platform sits behind them.
 */

export interface TodoRepository {
  listByTenant(tenantId: string): Promise<Todo[]>;
  create(todo: Todo): Promise<void>;
}

export interface TenantDomainRepository {
  findByDomain(domain: string): Promise<TenantDomain | null>;
}

export interface MembershipReader {
  listForUser(userId: string): Promise<Membership[]>;
  findForUserInTenantBySlug(userId: string, tenantSlug: string): Promise<Membership | null>;
  findForUserInTenantById(userId: string, tenantId: string): Promise<Membership | null>;
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
