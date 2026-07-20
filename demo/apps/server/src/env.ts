import { z } from 'zod';

/** The placeholder secret that ships in `.env.example`; refused on any deploy. */
export const DEV_ONLY_SECRET = 'dev-only-secret-do-not-use-in-prod';

/** Parse, don't cast: the process refuses to boot on invalid configuration. */
const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(47100),
    DATABASE_URL: z
      .string()
      .default('postgresql://agentproofarch:agentproofarch@localhost:47542/agentproofarch'),
    DB_DRIVER: z
      .enum(['node-postgres', 'neon-http'])
      .default(process.env.VERCEL ? 'neon-http' : 'node-postgres'),
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
    WEB_DIST_DIR: z.string().default('dist/web'),
  })
  // Production hardening: outside local dev the schema refuses dev-only config.
  // "Deployed" = running on Vercel (VERCEL set) OR hardened cookies on (a
  // self-host prod turns SECURE_COOKIES on), so local dev and the smoke/e2e
  // harnesses (neither set) are never subject to these rules.
  .superRefine((data, ctx) => {
    const deployed = data.VERCEL !== undefined || data.SECURE_COOKIES;
    if (deployed && data.BETTER_AUTH_SECRET === DEV_ONLY_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BETTER_AUTH_SECRET'],
        message: 'BETTER_AUTH_SECRET must be overridden with real entropy outside local dev',
      });
    }
    if (deployed && !data.SECURE_COOKIES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SECURE_COOKIES'],
        message: 'SECURE_COOKIES must be true outside local dev',
      });
    }
    if (data.VERCEL !== undefined && data.DB_DRIVER !== 'neon-http') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DB_DRIVER'],
        message: 'DB_DRIVER must be neon-http on Vercel',
      });
    }
  });

export type Env = z.output<typeof envSchema> & { APP_BASE_URL: string };

/** Pure boundary parse (no process.exit) so both success and refusal are unit-testable. */
export const parseEnv = (source: NodeJS.ProcessEnv = process.env) => envSchema.safeParse(source);

export const loadEnv = (): Env => {
  const parsed = parseEnv();
  if (!parsed.success) {
    console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  // Environment precedence for the public base URL: explicit APP_BASE_URL
  // (production alias) → the deployment's own Vercel URL (previews/staging,
  // no per-branch vars needed) → local dev.
  const APP_BASE_URL =
    parsed.data.APP_BASE_URL ??
    (parsed.data.VERCEL_URL ? `https://${parsed.data.VERCEL_URL}` : 'http://localhost:47100');
  return { ...parsed.data, APP_BASE_URL };
};
