import { describe, expect, it } from 'vitest';

import { trustedAuthHeaders } from './auth-network.js';

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
