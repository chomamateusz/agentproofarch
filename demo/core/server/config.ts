import { z } from 'zod';

/**
 * The single source of environment configuration (DECIDE F4). One module owns
 * every env key and its parse rule; the runtime server, the migrate/seed
 * composition points and observability each consume a command-specific subset,
 * so no two entry points can drift on a default or on the driver rule.
 *
 * The schemas are the shared field definitions; command-specific refinements
 * (e.g. the production hardening in `apps/server/src/env.ts`) layer on at the
 * consuming edge.
 */

export const DEFAULT_DATABASE_URL =
  'postgresql://agentproofarch:agentproofarch@localhost:47542/agentproofarch';

/** The placeholder secret that ships in `.env.example`; refused on any deploy. */
export const DEV_ONLY_SECRET = 'dev-only-secret-do-not-use-in-prod';

const dbDriverSchema = z.enum(['node-postgres', 'neon-http']);

const databaseUrlField = z.string().default(DEFAULT_DATABASE_URL);

// Platform-follows default read once at load: neon-http under Vercel, node-postgres
// otherwise — an explicit DB_DRIVER always wins. Shared so the runtime server and
// the build-time migrate/seed points resolve the driver identically.
const dbDriverField = dbDriverSchema.default(
  process.env.VERCEL ? 'neon-http' : 'node-postgres',
);

/** Runtime server env — the full set the Hono process boots on. */
export const serverEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(47100),
  // Self-host only: the private port the internal control-plane app binds
  // (Caddy's on-demand-TLS `ask` endpoint). Set exclusively in the compose
  // stack, where it is reachable only on the container network and never
  // published; unset elsewhere, so the internal app does not start (dev, smoke,
  // e2e and Vercel never expose the domain-check surface).
  INTERNAL_PORT: z.coerce.number().int().positive().optional(),
  // Domain-provisioning adapter selector (composition root). `caddy` on the
  // self-host target (on-demand TLS + DNS check), `noop` everywhere else.
  DOMAIN_PROVISIONER: z.enum(['caddy', 'noop']).default('noop'),
  // The public target self-host tenants must point a custom domain at; the caddy
  // DomainPort's `check` verifies DNS resolves here. Set one, not both.
  SELF_HOST_TARGET_CNAME: z.string().optional(),
  SELF_HOST_TARGET_IP: z.string().optional(),
  DATABASE_URL: databaseUrlField,
  DB_DRIVER: dbDriverField,
  APP_BASE_DOMAIN: z.string().default('localhost'),
  APP_BASE_URL: z.string().url().optional(),
  // Set by Vercel on every deployment (`VERCEL=1`). Presence is the "we are
  // deployed on Vercel" signal the hardening refinements key off.
  VERCEL: z.string().optional(),
  // Injected by Vercel into every deployment; previews derive their base URL
  // and trusted auth origin from these instead of per-branch env vars.
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  // Vendor-neutral build attestation (mapped from VERCEL_GIT_COMMIT_SHA in the
  // platform entry so the vendor name stays contained); surfaced by /api/health*.
  APP_COMMIT_SHA: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().min(16).default(DEV_ONLY_SECRET),
  SECURE_COOKIES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Off only in test harnesses: the e2e suite drives many sign-ins from a
  // single rate-limit bucket (no client IP behind the harness).
  AUTH_RATE_LIMIT: z
    .enum(['on', 'off'])
    .default('on')
    .transform((value) => value === 'on'),
  // Email transport selector (composition root), like DOMAIN_PROVISIONER. `dev`
  // (default): no real delivery — the magic link is logged and captured for
  // retrieval (US-026 AC). `smtp`: any RFC SMTP relay (Amazon SES SMTP creds
  // included) via the SMTP_* block, required only when selected.
  EMAIL_TRANSPORT: z.enum(['dev', 'smtp']).default('dev'),
  EMAIL_FROM: z.string().default('Agentproofarch <no-reply@localhost>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // Google social sign-in (FR-26), wired only when BOTH are present — the same
  // present-both-or-dormant gating as SENTRY_DSN. Absent = the provider is off
  // and the web login page hides its button.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  WEB_DIST_DIR: z.string().default('dist/web'),
});

export type ServerEnvParsed = z.output<typeof serverEnvSchema>;

/** Migration subset: connection string + driver selection only. */
export const databaseEnvSchema = z.object({
  DATABASE_URL: databaseUrlField,
  DB_DRIVER: dbDriverField,
});

/** Seed subset: connection string + the auth secret the seeder signs up with. */
export const seedEnvSchema = z.object({
  DATABASE_URL: databaseUrlField,
  BETTER_AUTH_SECRET: z.string().default(DEV_ONLY_SECRET),
});

/**
 * Observability subset. All optional — absent = no-op (dev/CI untouched):
 * an OTLP endpoint gates the tracer provider; `SENTRY_DSN` gates the Sentry
 * error sink. Each vendor is wired only when its key is present.
 */
export const observabilityEnvSchema = z.object({
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('agentproofarch-server'),
  SENTRY_DSN: z.string().optional(),
});
