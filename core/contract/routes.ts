import { z } from 'zod';

import { membershipSchema, newTodoSchema, roleSchema, todoSchema } from '@core/domain/index.js';

/**
 * Single source of truth for the HTTP API shared by server and all clients.
 * Every route is described by its method, path and zod schemas; the server
 * implements them, `core/client` consumes them. Neither side hand-writes URLs
 * or response types anywhere else.
 */

export const healthOutputSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  database: z.enum(['up', 'down']),
});

export const meOutputSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  tenant: z
    .object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      role: roleSchema,
    })
    .nullable(),
});

export const orgListOutputSchema = z.object({
  organizations: z.array(membershipSchema),
});

export const todoListOutputSchema = z.object({
  todos: z.array(todoSchema),
});

export const todoCreateInputSchema = newTodoSchema;

export const todoCreateOutputSchema = z.object({
  todo: todoSchema,
});

export const API_PATHS = {
  health: '/api/health',
  me: '/api/me',
  orgs: '/api/orgs',
  todos: '/api/todos',
} as const;

/** Header used by non-browser clients (CLI, tests) to select the tenant. */
export const TENANT_HEADER = 'x-tenant';
