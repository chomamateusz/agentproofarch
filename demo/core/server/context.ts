import type { Identity, TenantCreationMode } from '#core/domain/index.js';

import type { AuthenticatedUser, TenantAccessReader } from './ports.js';

/** Every tenant-scoped use-case takes this as its first argument. */
export interface Ctx {
  identity: Identity;
  tenantCreationMode?: TenantCreationMode;
}

export const tenantCreationContext = async (
  user: AuthenticatedUser,
  tenantCreationMode: TenantCreationMode,
  deps: { tenantAccess: TenantAccessReader },
): Promise<Ctx> => {
  const memberships =
    tenantCreationMode === 'staff'
      ? await deps.tenantAccess.listTenantsForStaff(user.userId)
      : [];
  const staffRole = memberships.some((membership) => membership.staffRole === 'owner')
    ? 'owner'
    : memberships.some((membership) => membership.staffRole === 'admin')
      ? 'admin'
      : null;

  return {
    identity: {
      userId: user.userId,
      email: user.email,
      name: user.name,
      tenantId: null,
      tenantSlug: null,
      tenantName: null,
      staffRole,
      memberId: null,
    },
    tenantCreationMode,
  };
};
