import { describe, expect, it } from 'vitest';

import { authIpAddressSettings } from '#adapters/auth/create-auth.js';

import { AUTH_TRUSTED_PROXIES } from '../apps/server/src/auth-network.js';

describe('auth rate-limit IP configuration', () => {
  it('fails closed when rate limiting is enabled without a trusted proxy', () => {
    expect(() => authIpAddressSettings(true, [])).toThrow(/trusted proxy/i);
  });

  it('retains the deployed proxy when rate limiting is enabled', () => {
    expect(authIpAddressSettings(true, AUTH_TRUSTED_PROXIES)).toEqual({
      trustedProxies: ['10.247.0.3'],
    });
  });
});
