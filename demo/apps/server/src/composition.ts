import { randomUUID } from 'node:crypto';

import { createDb } from '#adapters/db/client.js';
import { createCardRepository } from '#adapters/db/cards-repository.js';
import {
  createHealthPort,
  createTenantAccessReader,
  createTenantDomainRepository,
  createTenantRepository,
  createTodoRepository,
} from '#adapters/db/repositories.js';
import { createAuth, createAuthPort, type Auth } from '#adapters/auth/create-auth.js';
import { createCaddyDomainPort } from '#adapters/domain-provisioning/caddy.js';
import { createNoopDomainPort } from '#adapters/domain-provisioning/noop.js';
import type {
  AuthPort,
  CardRepository,
  Clock,
  DomainPort,
  HealthPort,
  IdGenerator,
  TenantAccessReader,
  TenantDomainRepository,
  TenantRepository,
  TodoRepository,
} from '#core/server/index.js';

import type { Env } from './env.js';

export interface AppDeps {
  auth: Auth;
  authPort: AuthPort;
  todos: TodoRepository;
  cards: CardRepository;
  tenantDomains: TenantDomainRepository;
  /** Domain provisioning/verification: caddy on self-host, noop elsewhere. */
  domainPort: DomainPort;
  tenants: TenantRepository;
  tenantAccess: TenantAccessReader;
  health: HealthPort;
  ids: IdGenerator;
  clock: Clock;
  baseDomain: string;
  /** Build attestation surfaced by the health routes; 'unknown' outside a deploy. */
  commitSha: string;
}

/**
 * Composition root — the ONLY place where env decides which adapters run.
 * Platform names (vercel, neon) may appear here and in adapters, never in core.
 */
// Exported for unit tests: selecting the adapter must be testable without
// constructing the full graph — a real Better Auth instance eagerly queries
// tenant_domains for trustedOrigins, which has no database on the check runner.
export const selectDomainPort = (env: Env): DomainPort =>
  env.DOMAIN_PROVISIONER === 'caddy'
    ? createCaddyDomainPort({
        targetCname: env.SELF_HOST_TARGET_CNAME,
        targetIp: env.SELF_HOST_TARGET_IP,
      })
    : createNoopDomainPort();

export const createDeps = (env: Env): AppDeps => {
  const db = createDb(env.DB_DRIVER, env.DATABASE_URL);
  const tenantDomains = createTenantDomainRepository(db);
  const domainPort = selectDomainPort(env);

  const baseTrustedOrigins = [
    env.APP_BASE_URL,
    // The deployment's own origin: previews and staging serve the SPA from
    // their generated Vercel URL, so auth POSTs arrive with that Origin.
    ...(env.VERCEL_URL ? [`https://${env.VERCEL_URL}`] : []),
    ...(env.VERCEL_BRANCH_URL ? [`https://${env.VERCEL_BRANCH_URL}`] : []),
    `http://*.${env.APP_BASE_DOMAIN}`,
    `https://*.${env.APP_BASE_DOMAIN}`,
    // Wildcard entries above don't match origins carrying an explicit port.
    `http://*.${env.APP_BASE_DOMAIN}:${env.PORT}`,
    `https://*.${env.APP_BASE_DOMAIN}:${env.PORT}`,
  ];

  const auth = createAuth(db, {
    secret: env.BETTER_AUTH_SECRET,
    baseUrl: env.APP_BASE_URL,
    baseDomain: env.APP_BASE_DOMAIN,
    secureCookies: env.SECURE_COOKIES,
    rateLimitEnabled: env.AUTH_RATE_LIMIT,
    trustedOrigins: async () => {
      const domains = await tenantDomains.listVerifiedDomains();
      return [
        ...baseTrustedOrigins,
        ...domains.map((domain) => `https://${domain.domain}`),
        ...domains.map((domain) => `http://${domain.domain}`),
      ];
    },
  });

  return {
    auth,
    authPort: createAuthPort(auth),
    todos: createTodoRepository(db),
    cards: createCardRepository(db),
    tenantDomains,
    domainPort,
    tenants: createTenantRepository(db),
    tenantAccess: createTenantAccessReader(db),
    health: createHealthPort(db),
    ids: { nextId: () => randomUUID() },
    clock: { nowIso: () => new Date().toISOString() },
    baseDomain: env.APP_BASE_DOMAIN,
    commitSha: env.APP_COMMIT_SHA ?? 'unknown',
  };
};
