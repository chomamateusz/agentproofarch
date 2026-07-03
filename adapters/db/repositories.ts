import { and, asc, eq, sql } from 'drizzle-orm';

import { roleSchema, type Membership, type Role } from '@core/domain/index.js';
import type {
  HealthPort,
  MembershipReader,
  TenantDomainRepository,
  TodoRepository,
} from '@core/server/index.js';

import type { Db } from './client.js';
import { member, organization, tenantDomains, todos } from './schema.js';

const parseRole = (raw: string): Role => {
  const parsed = roleSchema.safeParse(raw);
  return parsed.success ? parsed.data : 'member';
};

export const createTodoRepository = (db: Db): TodoRepository => ({
  listByTenant: async (tenantId) =>
    db.select().from(todos).where(eq(todos.tenantId, tenantId)).orderBy(asc(todos.createdAt)),
  create: async (todo) => {
    await db.insert(todos).values(todo);
  },
});

export const createTenantDomainRepository = (db: Db): TenantDomainRepository => ({
  findByDomain: async (domain) => {
    const rows = await db
      .select()
      .from(tenantDomains)
      .where(and(eq(tenantDomains.domain, domain), eq(tenantDomains.verified, true)))
      .limit(1);
    return rows[0] ?? null;
  },
});

export const createMembershipReader = (db: Db): MembershipReader => {
  const baseQuery = () =>
    db
      .select({
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id));

  const toMembership = (row: { id: string; slug: string; name: string; role: string }): Membership => ({
    tenant: { id: row.id, slug: row.slug, name: row.name },
    role: parseRole(row.role),
  });

  return {
    listForUser: async (userId) => {
      const rows = await baseQuery().where(eq(member.userId, userId));
      return rows.map(toMembership);
    },
    findForUserInTenantBySlug: async (userId, tenantSlug) => {
      const rows = await baseQuery()
        .where(and(eq(member.userId, userId), eq(organization.slug, tenantSlug)))
        .limit(1);
      const row = rows[0];
      return row ? toMembership(row) : null;
    },
    findForUserInTenantById: async (userId, tenantId) => {
      const rows = await baseQuery()
        .where(and(eq(member.userId, userId), eq(organization.id, tenantId)))
        .limit(1);
      const row = rows[0];
      return row ? toMembership(row) : null;
    },
  };
};

export const createHealthPort = (db: Db): HealthPort => ({
  pingDatabase: async () => {
    try {
      await db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  },
});
