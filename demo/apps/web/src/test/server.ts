import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import pkg from '../../../../package.json' with { type: 'json' };

/**
 * The unauthenticated client-config read fires on mount of the pre-auth pages
 * (LoginPage), so a default handler keeps `onUnhandledRequest: 'error'` happy
 * without every test re-declaring it. A test that needs Google on can override
 * this with its own `server.use(...)`.
 */
export const server = setupServer(
  http.get('*/api/config', () => HttpResponse.json({ ok: true, data: { googleEnabled: false } })),
  http.get('*/api/health', () =>
    HttpResponse.json({
      ok: true,
      data: { status: 'ok', version: pkg.version, sha: 'unknown', database: 'up' },
    }),
  ),
  // SettingsPage's PasskeySection reads the passkey roster on mount; a default
  // empty list keeps every page-level test that isn't about passkeys quiet. A
  // passkey-focused test overrides this with its own `server.use(...)`.
  http.get('*/passkey/list-user-passkeys', () => HttpResponse.json([])),
);
