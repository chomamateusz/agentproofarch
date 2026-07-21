import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * The unauthenticated client-config read fires on mount of the pre-auth pages
 * (LoginPage), so a default handler keeps `onUnhandledRequest: 'error'` happy
 * without every test re-declaring it. A test that needs Google on can override
 * this with its own `server.use(...)`.
 */
export const server = setupServer(
  http.get('*/api/config', () => HttpResponse.json({ ok: true, data: { googleEnabled: false } })),
);
