import { Hono } from 'hono';

import {
  API_PATHS,
  HTTP_STATUS_BY_ERROR_CODE,
  TENANT_HEADER,
  toEnvelope,
  todoCreateInputSchema,
} from '@core/contract/index.js';
import {
  err,
  internal,
  ok,
  validation,
  type AppError,
  type Identity,
  type Result,
} from '@core/domain/index.js';
import { addTodo, listMyOrganizations, listTodos, resolveIdentity } from '@core/server/index.js';

import type { AppDeps } from './composition.js';

type Vars = { Variables: { identity: Identity } };

const respond = <T>(result: Result<T, AppError>): Response => {
  const envelope = toEnvelope(result);
  const status = envelope.ok ? 200 : HTTP_STATUS_BY_ERROR_CODE[envelope.error.code];
  return new Response(JSON.stringify(envelope), {
    status,
    headers: { 'content-type': 'application/json' },
  });
};

export const buildApp = (deps: AppDeps) => {
  const app = new Hono<Vars>();

  app.onError((error) => {
    console.error('Unhandled error:', error);
    return respond(err(internal()));
  });

  app.get(API_PATHS.health, async () =>
    respond(
      ok({
        status: 'ok' as const,
        version: '0.1.0',
        database: (await deps.health.pingDatabase()) ? ('up' as const) : ('down' as const),
      }),
    ),
  );

  app.on(['GET', 'POST'], '/api/auth/*', (c) => deps.auth.handler(c.req.raw));

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
          identity.tenantId && identity.tenantSlug && identity.tenantName && identity.role
            ? {
                id: identity.tenantId,
                slug: identity.tenantSlug,
                name: identity.tenantName,
                role: identity.role,
              }
            : null,
      }),
    );
  });

  app.get(API_PATHS.orgs, async (c) => {
    const result = await listMyOrganizations({ identity: c.get('identity') }, deps);
    return respond(
      result.ok ? ok({ organizations: result.value }) : result,
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

  return app;
};
