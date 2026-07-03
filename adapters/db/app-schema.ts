import { index, pgTable, text, uniqueIndex, boolean } from 'drizzle-orm/pg-core';

import { organization, user } from './auth-schema.js';

export const todos = pgTable(
  'todos',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // ISO 8601 string; the domain speaks ISO strings, not driver-specific Dates.
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('todos_tenantId_idx').on(table.tenantId)],
);

export const tenantDomains = pgTable(
  'tenant_domains',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    kind: text('kind', { enum: ['subdomain', 'custom'] }).notNull(),
    verified: boolean('verified').notNull().default(false),
  },
  (table) => [uniqueIndex('tenant_domains_domain_uidx').on(table.domain)],
);
