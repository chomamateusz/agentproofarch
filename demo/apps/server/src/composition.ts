import { randomUUID } from 'node:crypto';

import { createDb } from '#adapters/db/client.js';
import { createCardRepository } from '#adapters/db/cards-repository.js';
import { createMemberRepository } from '#adapters/db/members-repository.js';
import { createStaffRepository, createUserDirectory } from '#adapters/db/staff-repository.js';
import {
  createHealthPort,
  createTenantAccessReader,
  createTenantDomainRepository,
  createTenantRepository,
  createTodoRepository,
} from '#adapters/db/repositories.js';
import { createAuth, createAuthPort, type Auth, type GoogleSettings } from '#adapters/auth/create-auth.js';
import { createDevEmailPort } from '#adapters/email/dev.js';
import { createSmtpEmailPort } from '#adapters/email/smtp.js';
import { createCaddyDomainPort } from '#adapters/domain-provisioning/caddy.js';
import { createNoopDomainPort } from '#adapters/domain-provisioning/noop.js';
import type {
  AuthPort,
  CardRepository,
  Clock,
  DevMailbox,
  DomainPort,
  EmailPort,
  HealthPort,
  IdGenerator,
  MemberRepository,
  StaffRepository,
  TenantAccessReader,
  TenantDomainRepository,
  TenantRepository,
  TodoRepository,
  UserDirectory,
} from '#core/server/index.js';

import type { Env } from './env.js';

export interface AppDeps {
  auth: Auth;
  authPort: AuthPort;
  todos: TodoRepository;
  cards: CardRepository;
  members: MemberRepository;
  staff: StaffRepository;
  users: UserDirectory;
  tenantDomains: TenantDomainRepository;
  /** Domain provisioning/verification: caddy on self-host, noop elsewhere. */
  domainPort: DomainPort;
  /** Outbound email: smtp on a configured relay, dev (capture-only) elsewhere. */
  email: EmailPort;
  /**
   * The dev transport's capture side (US-026): present ONLY under
   * `EMAIL_TRANSPORT=dev`, so the dev magic-link retrieval route exists only in
   * dev/CI and never on a real deploy. null when a real relay is configured.
   */
  devMailbox: DevMailbox | null;
  /** Whether Google social sign-in is wired (FR-26); surfaced to the login page. */
  googleEnabled: boolean;
  /** The public CNAME/IP a tenant points a custom domain at, surfaced by US-019. */
  domainTarget: { cname: string | null; ip: string | null };
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

/**
 * The SMTP relay is only fully configured when a host is set; selecting `smtp`
 * without one is a composition error (fail fast, not a silent no-delivery).
 */
export const selectEmailPort = (env: Env): EmailPort & { devMailbox: DevMailbox | null } => {
  if (env.EMAIL_TRANSPORT === 'smtp') {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      throw new Error('EMAIL_TRANSPORT=smtp requires SMTP_HOST, SMTP_USER and SMTP_PASS');
    }
    const port = createSmtpEmailPort({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.EMAIL_FROM,
    });
    return { ...port, devMailbox: null };
  }
  const dev = createDevEmailPort();
  return { ...dev, devMailbox: dev };
};

/** Google is wired only when BOTH keys are present (FR-26), else it stays dormant. */
export const selectGoogleSettings = (env: Env): GoogleSettings | undefined =>
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : undefined;

export const createDeps = (env: Env): AppDeps => {
  const db = createDb(env.DB_DRIVER, env.DATABASE_URL);
  const tenantDomains = createTenantDomainRepository(db);
  const domainPort = selectDomainPort(env);
  const { devMailbox, ...email } = selectEmailPort(env);
  const google = selectGoogleSettings(env);

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
    email,
    ...(google ? { google } : {}),
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
    members: createMemberRepository(db),
    staff: createStaffRepository(db),
    users: createUserDirectory(db),
    tenantDomains,
    domainPort,
    email,
    devMailbox,
    googleEnabled: google !== undefined,
    domainTarget: {
      cname: env.SELF_HOST_TARGET_CNAME ?? null,
      ip: env.SELF_HOST_TARGET_IP ?? null,
    },
    tenants: createTenantRepository(db),
    tenantAccess: createTenantAccessReader(db),
    health: createHealthPort(db),
    ids: { nextId: () => randomUUID() },
    clock: { nowIso: () => new Date().toISOString() },
    baseDomain: env.APP_BASE_DOMAIN,
    commitSha: env.APP_COMMIT_SHA ?? 'unknown',
  };
};
