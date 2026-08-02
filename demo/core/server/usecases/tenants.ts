import { decide, ok, type AppError, type Membership, type Result } from '#core/domain/index.js';

import type { Ctx } from '../context.js';
import type { TenantAccessReader } from '../ports.js';

export interface MyTenants {
  tenants: Membership[];
  canCreateTenant: boolean;
}

/**
 * Self-scoped read: enumerates only the caller's own staff memberships, so
 * authentication is the control — there is no capability to check (§Authorization).
 * `canCreateTenant` is the `createTenant` verdict for the same caller, reported
 * rather than enforced, so a client never offers an action the create route
 * would reject.
 */
export const listMyTenants = async (
  ctx: Ctx,
  deps: { tenantAccess: TenantAccessReader },
): Promise<Result<MyTenants, AppError>> =>
  ok({
    tenants: await deps.tenantAccess.listTenantsForStaff(ctx.identity.userId),
    canCreateTenant: decide(ctx.identity, 'tenant:create', ctx.tenantCreationMode).allowed,
  });
