import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeSignInCookies } from './client-adapter.js';

interface CapturedCall {
  url: string;
  method: string | undefined;
  origin: string | null;
}

const mockFetch = (response: {
  ok: boolean;
  status: number;
  text?: string;
  setCookie?: string[];
}): (() => CapturedCall | null) => {
  let captured: CapturedCall | null = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      captured = {
        url: String(url),
        method: init?.method,
        origin: new Headers(init?.headers).get('origin'),
      };
      return Promise.resolve({
        ok: response.ok,
        status: response.status,
        text: async () => Promise.resolve(response.text ?? ''),
        headers: { getSetCookie: () => response.setCookie ?? [] },
      });
    }),
  );
  return () => captured;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('probeSignInCookies', () => {
  it('POSTs to the sign-in route with an Origin header and returns the raw Set-Cookie', async () => {
    const setCookie = ['better-auth.session_token=abc; Path=/; HttpOnly; SameSite=Lax'];
    const call = mockFetch({ ok: true, status: 200, setCookie });

    const probe = await probeSignInCookies('http://localhost:47100', {
      email: 'demo@agentproofarch.dev',
      password: 'demo1234',
    });

    expect(probe).toEqual({ ok: true, status: 200, body: '', setCookie });
    expect(call()).toEqual({
      url: 'http://localhost:47100/api/auth/sign-in/email',
      method: 'POST',
      origin: 'http://localhost:47100',
    });
  });

  it('surfaces the response body on a failed sign-in', async () => {
    mockFetch({ ok: false, status: 401, text: 'Invalid credentials', setCookie: [] });

    const probe = await probeSignInCookies('http://localhost:47100', {
      email: 'demo@agentproofarch.dev',
      password: 'wrong',
    });

    expect(probe).toEqual({ ok: false, status: 401, body: 'Invalid credentials', setCookie: [] });
  });
});
