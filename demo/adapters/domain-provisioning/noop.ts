import type { DomainPort } from '#core/server/index.js';

/**
 * The dev/default DomainPort: no external provisioner exists, so every domain is
 * treated as ready. Selected when `DOMAIN_PROVISIONER` is unset — local dev and
 * the Vercel target (which provisions via the platform, not this port) both use it.
 */
export const createNoopDomainPort = (): DomainPort => ({
  provision: async () => {},
  remove: async () => {},
  check: async (domain) => ({ resolved: true, detail: `${domain} accepted (noop provisioner)` }),
});
