import { createBetterAuthClientAdapter } from '@adapters/auth/client-adapter.js';
import { createApiClient } from '@core/client/index.js';

/** Same-origin: the SPA is always served from the tenant's own domain. */
export const api = createApiClient({ baseUrl: '' });

export const authClient = createBetterAuthClientAdapter('');

/** URL of a sibling tenant on the same base domain (acme.localhost → globex.localhost). */
export const tenantUrl = (slug: string): string => {
  const { protocol, hostname, port } = window.location;
  const parts = hostname.split('.');
  const base = parts.length > 1 ? parts.slice(1).join('.') : hostname;
  return `${protocol}//${slug}.${base}${port ? `:${port}` : ''}`;
};

/** Stable accent hue per tenant so each tenant is visibly its own world. */
export const tenantHue = (slug: string): number => {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return Math.round((hash * 137.508) % 360);
};
