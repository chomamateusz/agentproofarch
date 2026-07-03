import {
  err,
  forbidden,
  ok,
  tenantNotFound,
  unauthorized,
  type AppError,
  type Identity,
  type Membership,
  type Result,
} from '@core/domain/index.js';

import type { AuthenticatedUser, MembershipReader, TenantDomainRepository } from '../ports.js';

export interface TenantRequestInfo {
  /** Host header, may include a port. */
  host: string;
  /** Value of the X-Tenant header, if any. */
  tenantHeader: string | null;
}

export interface ResolveIdentityDeps {
  tenantDomains: TenantDomainRepository;
  memberships: MembershipReader;
  /** e.g. "localhost" in dev, "agentproofarch.com" in prod. */
  baseDomain: string;
}

const stripPort = (host: string): string => host.split(':')[0] ?? host;

/**
 * Tenant resolution order (PRD §3.4):
 *  1. exact custom-domain match in tenant_domains,
 *  2. subdomain of the base domain (subdomain = tenant slug),
 *  3. X-Tenant header (CLI and other non-browser clients on the base domain).
 * A request on the bare base domain with no header yields a tenant-less identity.
 */
export const resolveIdentity = async (
  user: AuthenticatedUser | null,
  request: TenantRequestInfo,
  deps: ResolveIdentityDeps,
): Promise<Result<Identity, AppError>> => {
  if (!user) return err(unauthorized());

  const membership = await resolveMembership(user.userId, request, deps);
  if (!membership.ok) return membership;

  const base: Identity = {
    userId: user.userId,
    email: user.email,
    name: user.name,
    tenantId: null,
    tenantSlug: null,
    tenantName: null,
    role: null,
  };

  if (!membership.value) return ok(base);

  return ok({
    ...base,
    tenantId: membership.value.tenant.id,
    tenantSlug: membership.value.tenant.slug,
    tenantName: membership.value.tenant.name,
    role: membership.value.role,
  });
};

const resolveMembership = async (
  userId: string,
  request: TenantRequestInfo,
  deps: ResolveIdentityDeps,
): Promise<Result<Membership | null, AppError>> => {
  const host = stripPort(request.host).toLowerCase();

  const customDomain = await deps.tenantDomains.findByDomain(host);
  if (customDomain) {
    const membership = await deps.memberships.findForUserInTenantById(
      userId,
      customDomain.tenantId,
    );
    return membership ? ok(membership) : err(forbidden('You are not a member of this tenant'));
  }

  const slug = subdomainOf(host, deps.baseDomain) ?? request.tenantHeader?.toLowerCase() ?? null;
  if (!slug) return ok(null);

  const membership = await deps.memberships.findForUserInTenantBySlug(userId, slug);
  return membership
    ? ok(membership)
    : err(tenantNotFound(`No tenant "${slug}" or you are not a member of it`));
};

const subdomainOf = (host: string, baseDomain: string): string | null => {
  if (host === baseDomain) return null;
  if (!host.endsWith(`.${baseDomain}`)) return null;
  const sub = host.slice(0, -(baseDomain.length + 1));
  // Nested subdomains (a.b.localhost) are not tenant slugs.
  if (sub.includes('.')) return null;
  return sub;
};
