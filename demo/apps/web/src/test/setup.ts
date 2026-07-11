import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './server.js';

/**
 * jsdom and undici expose AbortSignal from different realms, so the signal
 * TanStack Query attaches fails undici's `instanceof` check inside MSW's
 * request cloning. Tests never abort, so drop the signal at the fetch seam.
 */
const dropSignal = (init?: RequestInit): RequestInit | undefined =>
  init === undefined ? init : { ...init, signal: null };

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  const patched = globalThis.fetch;
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => patched(input, dropSignal(init));
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
