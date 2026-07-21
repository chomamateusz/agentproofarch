import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';

import {
  API_PATHS,
  TENANT_HEADER,
  cardCreateInputSchema,
  cardMoveInputSchema,
  cardsListQuerySchema,
  memberEnsureInputSchema,
  memberExportQuerySchema,
  memberRemoveInputSchema,
  memberUpdateInputSchema,
  staffGrantInputSchema,
  staffRevokeInputSchema,
  tenantCreateInputSchema,
  todoCreateInputSchema,
} from '#core/contract/index.js';
import {
  domainAddInputSchema,
  domainCheckInputSchema,
  domainRemoveInputSchema,
  err,
  internal,
  notFound,
  ok,
  unauthorized,
  unavailable,
  validation,
  type Identity,
} from '#core/domain/index.js';
import {
  addCard,
  addDomain,
  addTodo,
  checkDomain,
  createTenant,
  ensureMember,
  exportMember,
  grantAdmin,
  listCards,
  listDomains,
  listMembers,
  listMyTenants,
  listStaff,
  listTodos,
  moveCard,
  removeDomain,
  removeMember,
  resolveIdentity,
  revokeAdmin,
  updateMember,
  type AuthenticatedUser,
} from '#core/server/index.js';
import { BETTER_AUTH_API_PATH_PATTERN } from '#adapters/auth/create-auth.js';

import type { AppDeps } from './composition.js';
import { captureServerException } from './observability.js';
import { registerPublicRoutes } from './public-app.js';
import { respond } from './respond.js';
import { recordException, telemetryMiddleware } from './telemetry.js';
import { APP_VERSION } from './version.js';

type Vars = { Variables: { identity: Identity } };

// The Better Auth namespace prefix, derived from the one sanctioned pattern so no
// route string is spelled by hand (lint bans literal auth routes outside adapters).
const BETTER_AUTH_PATH_PREFIX = BETTER_AUTH_API_PATH_PATTERN.slice(0, -1);

const tenantlessIdentity = (user: AuthenticatedUser): Identity => ({
  userId: user.userId,
  email: user.email,
  name: user.name,
  tenantId: null,
  tenantSlug: null,
  tenantName: null,
  staffRole: null,
  memberId: null,
});

export const buildApp = (deps: AppDeps) => {
  const app = new Hono<Vars>();

  // Security baseline (architecture §Security baseline). style-src allows
  // inline because emotion injects runtime <style> tags; scripts stay 'self'.
  // On Vercel the static SPA bypasses this function — vercel.json carries the
  // same headers for non-/api/ paths; this middleware covers API + self-host.
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
      referrerPolicy: 'strict-origin-when-cross-origin',
    }),
  );
  // JSON payloads are small; a 100KB cap is a cheap DoS floor under Vercel's
  // 4.5MB platform backstop. The over-limit response stays an envelope so
  // clients never see a non-JSON body from the API.
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 100 * 1024,
      onError: () => respond(err(validation('Request body exceeds the 100KB limit'))),
    }),
  );

  app.use('*', telemetryMiddleware);

  // The one server error seam: an unhandled throw (an infra rejection a
  // use-case never catches) is normalized to `internal` exactly here. Both
  // observers attach to that single error — the OTel span and the Sentry sink —
  // so there is one capture path, never scattered `captureException` calls.
  app.onError((error, c) => {
    const appError = internal();
    recordException(error);
    captureServerException(error, { appError, identity: c.get('identity') });
    return respond(err(appError));
  });

  // Health surface (public, before tenant resolution): liveness never touches
  // the database; readiness gates on it (503 when down); the compat `/api/health`
  // reports the database inline at 200. All three carry the deploy attestation.
  const attestation = { version: APP_VERSION, sha: deps.commitSha };

  app.get(API_PATHS.healthLive, () => respond(ok({ status: 'ok' as const, ...attestation })));

  app.get(API_PATHS.healthReady, async () =>
    respond(
      (await deps.health.pingDatabase())
        ? ok({ status: 'ok' as const, ...attestation, database: 'up' as const })
        : err(unavailable('Database is not reachable')),
    ),
  );

  app.get(API_PATHS.health, async () =>
    respond(
      ok({
        status: 'ok' as const,
        ...attestation,
        database: (await deps.health.pingDatabase()) ? ('up' as const) : ('down' as const),
      }),
    ),
  );

  app.on(['GET', 'POST'], BETTER_AUTH_API_PATH_PATTERN, (c) => deps.auth.handler(c.req.raw));

  // The public, unauthenticated contract group (US-028, §Public surface). Mounted
  // HERE — before the `/api/*` tenant-resolution middleware below — so a request
  // to `/api/public/*` is answered by a terminal handler and never reaches
  // identity resolution or authorization. Open CORS is scoped to this group only.
  registerPublicRoutes(app, deps);

  // Tenancy self-service sits ABOVE tenant resolution: listing and creating one's
  // own tenants are self-scoped operations gated by authentication alone, not by
  // the tenant the current host resolves to (§Authorization — `listMyTenants` is
  // the reasoned no-capability read). Serving them here lets the switcher and the
  // post-register onboarding work on ANY host, including a tenant domain the
  // caller has no access to (where the `/api/*` middleware below would 403).
  app.get(API_PATHS.tenants, async (c) => {
    const user = await deps.authPort.getAuthenticatedUser(c.req.raw.headers);
    if (!user) return respond(err(unauthorized()));
    const result = await listMyTenants({ identity: tenantlessIdentity(user) }, deps);
    return respond(result.ok ? ok({ tenants: result.value }) : result);
  });

  app.post(API_PATHS.tenants, async (c) => {
    const user = await deps.authPort.getAuthenticatedUser(c.req.raw.headers);
    if (!user) return respond(err(unauthorized()));
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = tenantCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      return respond(err(validation('Invalid tenant payload', parsed.error.flatten())));
    }
    const result = await createTenant({ identity: tenantlessIdentity(user) }, parsed.data, deps);
    return respond(result.ok ? ok({ tenant: result.value }) : result);
  });

  // Everything below is tenant-aware: authenticate, resolve tenant, inject identity.
  app.use('/api/*', async (c, next) => {
    const user = await deps.authPort.getAuthenticatedUser(c.req.raw.headers);
    const identity = await resolveIdentity(
      user,
      {
        host: c.req.header('host') ?? '',
        tenantHeader: c.req.header(TENANT_HEADER) ?? null,
      },
      deps,
    );
    if (!identity.ok) return respond(identity);
    c.set('identity', identity.value);
    await next();
  });

  app.get(API_PATHS.me, (c) => {
    const identity = c.get('identity');
    return respond(
      ok({
        userId: identity.userId,
        email: identity.email,
        name: identity.name,
        tenant:
          identity.tenantId &&
          identity.tenantSlug &&
          identity.tenantName &&
          (identity.staffRole || identity.memberId)
            ? {
                id: identity.tenantId,
                slug: identity.tenantSlug,
                name: identity.tenantName,
                staffRole: identity.staffRole,
                memberId: identity.memberId,
              }
            : null,
      }),
    );
  });

  app.get(API_PATHS.todos, async (c) => {
    const result = await listTodos({ identity: c.get('identity') }, deps);
    return respond(result.ok ? ok({ todos: result.value }) : result);
  });

  app.post(API_PATHS.todos, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = todoCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      return respond(err(validation('Invalid todo payload', parsed.error.flatten())));
    }
    const result = await addTodo({ identity: c.get('identity') }, parsed.data, deps);
    return respond(result.ok ? ok({ todo: result.value }) : result);
  });

  app.get(API_PATHS.cards, async (c) => {
    const parsed = cardsListQuerySchema.safeParse({ board: c.req.query('board') });
    if (!parsed.success) {
      return respond(err(validation('Invalid board', parsed.error.flatten())));
    }
    const result = await listCards({ identity: c.get('identity') }, parsed.data, deps);
    return respond(result.ok ? ok({ cards: result.value }) : result);
  });

  app.post(API_PATHS.cards, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = cardCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      return respond(err(validation('Invalid card payload', parsed.error.flatten())));
    }
    const result = await addCard({ identity: c.get('identity') }, parsed.data, deps);
    return respond(result.ok ? ok({ card: result.value }) : result);
  });

  app.post(API_PATHS.cardsMove, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = cardMoveInputSchema.safeParse(body);
    if (!parsed.success) {
      return respond(err(validation('Invalid card move payload', parsed.error.flatten())));
    }
    const result = await moveCard({ identity: c.get('identity') }, parsed.data, deps);
    return respond(result.ok ? ok({ card: result.value }) : result);
  });

  app.get(API_PATHS.members, async (c) => {
    const result = await listMembers({ identity: c.get('identity') }, deps);
    return respond(result.ok ? ok({ members: result.value }) : result);
  });

  app.post(API_PATHS.members, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = memberEnsureInputSchema.safeParse(body);
    if (!parsed.success) {
      return respond(err(validation('Invalid member payload', parsed.error.flatten())));
    }
    const result = await ensureMember({ identity: c.get('identity') }, parsed.data, deps);
    return respond(result.ok ? ok(result.value) : result);
  });

  app.post(API_PATHS.membersUpdate, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = memberUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      return respond(err(validation('Invalid member update payload', parsed.error.flatten())));
    }
    const result = await updateMember({ identity: c.get('identity') }, parsed.data, deps);
    return respond(result.ok ? ok({ member: result.value }) : result);
  });

  app.post(API_PATHS.membersRemove, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = memberRemoveInputSchema.safeParse(body);
    if (!parsed.success) {
      return respond(err(validation('Invalid member reference', parsed.error.flatten())));
    }
    const result = await removeMember({ identity: c.get('identity') }, parsed.data, deps);
    return respond(result.ok ? ok(result.value) : result);
  });

  app.get(API_PATHS.membersExport, async (c) => {
    const parsed = memberExportQuerySchema.safeParse({ id: c.req.query('id') });
    if (!parsed.success) {
      return respond(err(validation('Invalid member reference', parsed.error.flatten())));
    }
    const result = await exportMember({ identity: c.get('identity') }, parsed.data, deps);
    return respond(result.ok ? ok(result.value) : result);
  });

  app.get(API_PATHS.staff, async (c) => {
    const result = await listStaff({ identity: c.get('identity') }, deps);
    return respond(result.ok ? ok({ staff: result.value }) : result);
  });

  app.post(API_PATHS.staff, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = staffGrantInputSchema.safeParse(body);
    if (!parsed.success) {
      return respond(err(validation('Invalid admin grant payload', parsed.error.flatten())));
    }
    const result = await grantAdmin({ identity: c.get('identity') }, parsed.data, deps);
    return respond(result.ok ? ok(result.value) : result);
  });

  app.post(API_PATHS.staffRevoke, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = staffRevokeInputSchema.safeParse(body);
    if (!parsed.success) {
      return respond(err(validation('Invalid staff reference', parsed.error.flatten())));
    }
    const result = await revokeAdmin({ identity: c.get('identity') }, parsed.data, deps);
    return respond(result.ok ? ok(result.value) : result);
  });

  app.get(API_PATHS.domains, async (c) => {
    const result = await listDomains({ identity: c.get('identity') }, deps);
    return respond(result.ok ? ok({ domains: result.value, target: deps.domainTarget }) : result);
  });

  app.post(API_PATHS.domains, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = domainAddInputSchema.safeParse(body);
    if (!parsed.success) {
      return respond(err(validation('Invalid domain payload', parsed.error.flatten())));
    }
    const result = await addDomain({ identity: c.get('identity') }, parsed.data, deps);
    return respond(result.ok ? ok({ domain: result.value }) : result);
  });

  app.post(API_PATHS.domainsCheck, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = domainCheckInputSchema.safeParse(body);
    if (!parsed.success) {
      return respond(err(validation('Invalid domain payload', parsed.error.flatten())));
    }
    const result = await checkDomain({ identity: c.get('identity') }, parsed.data, deps);
    return respond(result.ok ? ok(result.value) : result);
  });

  app.post(API_PATHS.domainsRemove, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = domainRemoveInputSchema.safeParse(body);
    if (!parsed.success) {
      return respond(err(validation('Invalid domain payload', parsed.error.flatten())));
    }
    const result = await removeDomain({ identity: c.get('identity') }, parsed.data, deps);
    return respond(result.ok ? ok(result.value) : result);
  });

  // Total the API surface: any /api/* request that reached here matched no route
  // above — an unknown path or a wrong method on a known path. Return the taxonomy
  // `not_found` envelope through `respond` (so it inherits no-store + is folded
  // into the request span) instead of Hono's bare 404 text/plain, which the client
  // can only degrade to a generic `internal` "Non-JSON response". The Better Auth
  // namespace is carved out: it owns that prefix for every method, so defer to its
  // handler rather than masking a real auth route with our envelope.
  app.all('/api/*', (c) =>
    c.req.path.startsWith(BETTER_AUTH_PATH_PREFIX)
      ? deps.auth.handler(c.req.raw)
      : respond(err(notFound(`No API route for ${c.req.method} ${new URL(c.req.url).pathname}`))),
  );

  return app;
};
