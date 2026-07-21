import { describe, expect, it } from 'vitest';

import { createAuth } from '#adapters/auth/create-auth.js';
import { createDb } from '#adapters/db/client.js';
import {
  API_PATHS,
  healthLiveOutputSchema,
  healthOutputSchema,
  healthReadyOutputSchema,
  looseEnvelopeSchema,
  TENANT_HEADER,
} from '#core/contract/index.js';
import type { AuthenticatedUser } from '#core/server/index.js';

import { buildApp } from './app.js';
import type { AppDeps } from './composition.js';

// A real Better Auth instance satisfies the AppDeps.auth field without a cast.
// It is never exercised here: no test hits the auth handler route, and the
// lazy pg pool behind it opens no connection.
const auth = createAuth(
  createDb('node-postgres', 'postgresql://user:pass@localhost:5432/agentproofarch_test'),
  {
    secret: 'test-secret-value-that-is-at-least-32-chars',
    baseUrl: 'http://localhost',
    baseDomain: 'localhost',
    rateLimitEnabled: false,
    trustedOrigins: [],
    secureCookies: false,
  },
);

const baseDeps = (): AppDeps => ({
  auth,
  authPort: { getAuthenticatedUser: async () => null },
  todos: {
    listByTenant: async () => [],
    create: async () => {},
  },
  cards: {
    listByTenant: async () => [],
    create: async () => {},
    updatePositions: async () => {},
  },
  tenantDomains: {
    findByDomain: async () => null,
    listVerifiedDomains: async () => [],
  },
  domainPort: {
    provision: async () => {},
    remove: async () => {},
    check: async () => ({ resolved: true, detail: 'noop' }),
  },
  tenants: {
    findById: async () => null,
    findBySlug: async () => null,
    createTenant: async () => {
      throw new Error('not implemented in fake');
    },
    createOwnerGrant: async () => {
      throw new Error('not implemented in fake');
    },
    deleteTenant: async () => {
      throw new Error('not implemented in fake');
    },
  },
  tenantAccess: {
    listTenantsForStaff: async () => [],
    findStaffGrant: async () => null,
    findMember: async () => null,
  },
  health: { pingDatabase: async () => true },
  ids: { nextId: () => 'test-id' },
  clock: { nowIso: () => '2026-07-15T00:00:00.000Z' },
  baseDomain: 'localhost',
  commitSha: 'test-sha',
});

const user: AuthenticatedUser = {
  userId: 'user-1',
  email: 'demo@agentproofarch.dev',
  name: 'Demo',
};

describe('buildApp routes', () => {
  it('answers an over-100KB POST with a validation envelope, never a bare 413', async () => {
    const oversized = JSON.stringify({ slug: 'a', name: 'x'.repeat(200 * 1024) });
    const res = await buildApp(baseDeps()).request(API_PATHS.tenants, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: oversized,
    });

    expect(res.status).toBe(400);
    expect(res.status).not.toBe(413);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = looseEnvelopeSchema.parse(await res.json());
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.error.code).toBe('validation');
  });

  it('answers a malformed JSON body with a validation envelope', async () => {
    const deps = baseDeps();
    deps.authPort = { getAuthenticatedUser: async () => user };
    const res = await buildApp(deps).request(API_PATHS.tenants, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'this is not json at all',
    });

    expect(res.status).toBe(400);
    const body = looseEnvelopeSchema.parse(await res.json());
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.error.code).toBe('validation');
  });

  it('resolves an unknown tenant header to a tenant_not_found error', async () => {
    const deps = baseDeps();
    deps.authPort = { getAuthenticatedUser: async () => user };
    const res = await buildApp(deps).request(API_PATHS.todos, {
      headers: { [TENANT_HEADER]: 'ghost-tenant' },
    });

    expect(res.status).toBe(404);
    const body = looseEnvelopeSchema.parse(await res.json());
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.error.code).toBe('tenant_not_found');
  });

  it('surfaces a thrown dependency as an internal envelope through onError', async () => {
    const deps = baseDeps();
    deps.health = {
      pingDatabase: async () => {
        throw new Error('database connection exploded');
      },
    };
    const res = await buildApp(deps).request(API_PATHS.health);

    expect(res.status).toBe(500);
    const body = looseEnvelopeSchema.parse(await res.json());
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.error.code).toBe('internal');
  });

  it('sets the security baseline headers on API responses', async () => {
    const res = await buildApp(baseDeps()).request(API_PATHS.health);

    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('marks both success and error responses no-store', async () => {
    const successRes = await buildApp(baseDeps()).request(API_PATHS.health);
    expect(successRes.status).toBe(200);
    expect(successRes.headers.get('cache-control')).toBe('no-store');

    const errorRes = await buildApp(baseDeps()).request(API_PATHS.me);
    expect(errorRes.status).toBe(401);
    expect(errorRes.headers.get('cache-control')).toBe('no-store');
  });

  it('answers an unknown /api/* path with a not_found envelope, never a bare text/plain 404', async () => {
    const deps = baseDeps();
    deps.authPort = { getAuthenticatedUser: async () => user };
    const res = await buildApp(deps).request('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = looseEnvelopeSchema.parse(await res.json());
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.error.code).toBe('not_found');
  });

  it('answers a wrong method on a known route (POST /api/me) with a not_found envelope', async () => {
    const deps = baseDeps();
    deps.authPort = { getAuthenticatedUser: async () => user };
    const res = await buildApp(deps).request(API_PATHS.me, { method: 'POST' });

    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = looseEnvelopeSchema.parse(await res.json());
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.error.code).toBe('not_found');
  });

  it('reports the database as down when the health ping fails', async () => {
    const deps = baseDeps();
    deps.health = { pingDatabase: async () => false };
    const res = await buildApp(deps).request(API_PATHS.health);

    expect(res.status).toBe(200);
    const body = looseEnvelopeSchema.parse(await res.json());
    expect(body.ok).toBe(true);
    if (body.ok) {
      const health = healthOutputSchema.parse(body.data);
      expect(health.database).toBe('down');
      expect(health.sha).toBe('test-sha');
    }
  });

  it('liveness is 200 with attestation and never touches the database', async () => {
    const deps = baseDeps();
    deps.health = {
      pingDatabase: async () => {
        throw new Error('the DB must not be pinged for liveness');
      },
    };
    const res = await buildApp(deps).request(API_PATHS.healthLive);

    expect(res.status).toBe(200);
    const body = looseEnvelopeSchema.parse(await res.json());
    expect(body.ok).toBe(true);
    if (body.ok) {
      const live = healthLiveOutputSchema.parse(body.data);
      expect(live.sha).toBe('test-sha');
      expect(live.version).toBeTruthy();
    }
  });

  it('readiness is 200 with database up when the ping succeeds', async () => {
    const res = await buildApp(baseDeps()).request(API_PATHS.healthReady);

    expect(res.status).toBe(200);
    const body = looseEnvelopeSchema.parse(await res.json());
    expect(body.ok).toBe(true);
    if (body.ok) {
      const ready = healthReadyOutputSchema.parse(body.data);
      expect(ready.database).toBe('up');
      expect(ready.sha).toBe('test-sha');
    }
  });

  it('readiness is a 503 unavailable envelope when the database is down', async () => {
    const deps = baseDeps();
    deps.health = { pingDatabase: async () => false };
    const res = await buildApp(deps).request(API_PATHS.healthReady);

    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = looseEnvelopeSchema.parse(await res.json());
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.error.code).toBe('unavailable');
  });
});
