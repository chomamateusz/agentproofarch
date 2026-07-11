import { createBetterAuthClientAdapter } from '@adapters/auth/client-adapter.js';
import { createApiClient } from '@core/client/index.js';

/** Same-origin: the SPA is always served from the tenant's own domain. */
export const api = createApiClient({ baseUrl: '' });

export const authClient = createBetterAuthClientAdapter('');
