import { ok, type AppError, type Membership, type Result } from '@core/domain/index.js';

import type { Ctx } from '../context.js';
import type { MembershipReader } from '../ports.js';

export const listMyOrganizations = async (
  ctx: Ctx,
  deps: { memberships: MembershipReader },
): Promise<Result<Membership[], AppError>> => ok(await deps.memberships.listForUser(ctx.identity.userId));
