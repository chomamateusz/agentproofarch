import { and, count, eq, sql } from 'drizzle-orm';

import { staffMemberSchema } from '#core/domain/index.js';
import type { StaffGrant, StaffRepository, UserDirectory } from '#core/server/index.js';

import type { Db } from './client.js';
import { tenantAdmins, user } from './schema.js';

export const createStaffRepository = (db: Db): StaffRepository => ({
  listByTenant: async (tenantId) => {
    const rows = await db
      .select({
        id: tenantAdmins.id,
        userId: tenantAdmins.userId,
        email: user.email,
        name: user.name,
        role: tenantAdmins.role,
      })
      .from(tenantAdmins)
      .innerJoin(user, eq(tenantAdmins.userId, user.id))
      .where(eq(tenantAdmins.tenantId, tenantId))
      .orderBy(tenantAdmins.role, user.email);
    // Parse at the boundary: the `role` column stores a plain string the domain
    // schema narrows back to the `owner|admin` union.
    return rows.map((row) => staffMemberSchema.parse(row));
  },
  findGrant: async (tenantId, userId) => {
    const rows = await db
      .select({ id: tenantAdmins.id, userId: tenantAdmins.userId, role: tenantAdmins.role })
      .from(tenantAdmins)
      .where(and(eq(tenantAdmins.tenantId, tenantId), eq(tenantAdmins.userId, userId)))
      .limit(1);
    const row = rows[0];
    // The row's `role` is a stored string; narrow it through the grant shape.
    return row ? (staffGrantSchema.parse(row) satisfies StaffGrant) : null;
  },
  countOwners: async (tenantId) => {
    const rows = await db
      .select({ owners: count() })
      .from(tenantAdmins)
      .where(and(eq(tenantAdmins.tenantId, tenantId), eq(tenantAdmins.role, 'owner')));
    return rows[0]?.owners ?? 0;
  },
  grant: async (input) => {
    await db.insert(tenantAdmins).values(input);
  },
  revoke: async (tenantId, userId) => {
    const removed = await db
      .delete(tenantAdmins)
      .where(and(eq(tenantAdmins.tenantId, tenantId), eq(tenantAdmins.userId, userId)))
      .returning({ id: tenantAdmins.id });
    return removed.length;
  },
});

const staffGrantSchema = staffMemberSchema.pick({ id: true, userId: true, role: true });

export const createUserDirectory = (db: Db): UserDirectory => ({
  findByEmail: async (email) => {
    const rows = await db
      .select({ userId: user.id, email: user.email, name: user.name })
      .from(user)
      .where(eq(sql`lower(${user.email})`, email.toLowerCase()))
      .limit(1);
    return rows[0] ?? null;
  },
});
