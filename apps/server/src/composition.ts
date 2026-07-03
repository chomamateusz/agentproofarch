import { randomUUID } from 'node:crypto';

import { createDb } from '@adapters/db/client.js';
import {
  createHealthPort,
  createMembershipReader,
  createTenantDomainRepository,
  createTodoRepository,
} from '@adapters/db/repositories.js';
import { createAuth, createAuthPort, type Auth } from '@adapters/auth/create-auth.js';
import type {
  AuthPort,
  Clock,
  HealthPort,
  IdGenerator,
  MembershipReader,
  TenantDomainRepository,
  TodoRepository,
} from '@core/server/index.js';

import type { Env } from './env.js';

export interface AppDeps {
  auth: Auth;
  authPort: AuthPort;
  todos: TodoRepository;
  tenantDomains: TenantDomainRepository;
  memberships: MembershipReader;
  health: HealthPort;
  ids: IdGenerator;
  clock: Clock;
  baseDomain: string;
}

/**
 * Composition root — the ONLY place where env decides which adapters run.
 * Platform names (vercel, neon) may appear here and in adapters, never in core.
 */
export const createDeps = (env: Env): AppDeps => {
  const db = createDb(env.DB_DRIVER, env.DATABASE_URL);

  const auth = createAuth(db, {
    secret: env.BETTER_AUTH_SECRET,
    baseUrl: env.APP_BASE_URL,
    baseDomain: env.APP_BASE_DOMAIN,
    secureCookies: env.SECURE_COOKIES,
    trustedOrigins: [
      env.APP_BASE_URL,
      `http://*.${env.APP_BASE_DOMAIN}`,
      `https://*.${env.APP_BASE_DOMAIN}`,
      // Wildcard entries above don't match origins carrying an explicit port.
      `http://*.${env.APP_BASE_DOMAIN}:${env.PORT}`,
      `https://*.${env.APP_BASE_DOMAIN}:${env.PORT}`,
    ],
  });

  return {
    auth,
    authPort: createAuthPort(auth),
    todos: createTodoRepository(db),
    tenantDomains: createTenantDomainRepository(db),
    memberships: createMembershipReader(db),
    health: createHealthPort(db),
    ids: { nextId: () => randomUUID() },
    clock: { nowIso: () => new Date().toISOString() },
    baseDomain: env.APP_BASE_DOMAIN,
  };
};
