import { boolean, index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

export const tenants = pgTable(
  'tenants',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('tenants_slug_uidx').on(table.slug)],
);

export const tenantAdmins = pgTable(
  'tenant_admins',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role', { enum: ['owner', 'admin'] }).notNull(),
  },
  (table) => [
    index('tenant_admins_tenantId_idx').on(table.tenantId),
    index('tenant_admins_userId_idx').on(table.userId),
    uniqueIndex('tenant_admins_tenant_user_uidx').on(table.tenantId, table.userId),
  ],
);

export const members = pgTable(
  'members',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('members_tenantId_idx').on(table.tenantId),
    index('members_userId_idx').on(table.userId),
    uniqueIndex('members_tenant_user_uidx').on(table.tenantId, table.userId),
  ],
);

export const todos = pgTable(
  'todos',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdBy: text('created_by').notNull(),
    // ISO 8601 string; the domain speaks ISO strings, not driver-specific Dates.
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('todos_tenantId_idx').on(table.tenantId)],
);

export const cards = pgTable(
  'cards',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    // Board-agnostic: the legal column set is data of a board, validated at the
    // use-case boundary, so the substrate stores a plain string.
    column: text('column').notNull(),
    // Contiguous 0-based index within a (tenant, column); rewritten on move.
    position: integer('position').notNull(),
    // ISO 8601 string; the domain speaks ISO strings, not driver-specific Dates.
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('cards_tenant_column_idx').on(table.tenantId, table.column, table.position)],
);

export const tenantDomains = pgTable(
  'tenant_domains',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    kind: text('kind', { enum: ['subdomain', 'custom'] }).notNull(),
    verified: boolean('verified').notNull().default(false),
  },
  (table) => [uniqueIndex('tenant_domains_domain_uidx').on(table.domain)],
);
