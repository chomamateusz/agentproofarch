import { getIp } from 'better-auth/api';
import { describe, expect, it } from 'vitest';

import { authIpAddressSettings } from '#adapters/auth/create-auth.js';

import { AUTH_TRUSTED_PROXIES, trustedAuthHeaders } from './auth-network.js';

describe('trusted auth client IP headers', () => {
  it('overwrites a spoofed forwarded chain on a direct connection', () => {
    const headers = trustedAuthHeaders(
      new Headers({ 'x-forwarded-for': '198.51.100.1' }),
      '203.0.113.5',
    );
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.5');
  });

  it('retains the value Caddy overwrote when the exact proxy connected', () => {
    const headers = trustedAuthHeaders(
      new Headers({ 'x-forwarded-for': '203.0.113.5' }),
      '::ffff:10.247.0.3',
    );
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.5');
  });

  it('drops an untrusted header when the socket address is unavailable', () => {
    const headers = trustedAuthHeaders(
      new Headers({ 'x-forwarded-for': '198.51.100.1' }),
      undefined,
    );
    expect(headers.has('x-forwarded-for')).toBe(false);
  });
});

describe('the client address the rate limiter buckets on', () => {
  const options = { advanced: { ipAddress: authIpAddressSettings(true, AUTH_TRUSTED_PROXIES) } };
  const forwarded = (chain: string) => getIp(new Headers({ 'x-forwarded-for': chain }), options);

  it('skips the pinned self-host proxy and keeps the client it forwarded for', () => {
    expect(forwarded('203.0.113.5, 10.247.0.3')).toBe('203.0.113.5');
  });

  it('keeps the hop a platform edge wrote, discarding the prefix the client supplied', () => {
    expect(forwarded('9.9.9.9, 203.0.113.5')).toBe('203.0.113.5');
  });
});
