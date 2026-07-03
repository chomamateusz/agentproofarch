import { createAuthClient } from 'better-auth/client';
import { organizationClient } from 'better-auth/client/plugins';

import type { AuthClientPort } from '@core/client/index.js';
import { appError, err, ok, type AppError, type Result } from '@core/domain/index.js';

const toResult = (error: { message?: string | undefined; status: number } | null): Result<void, AppError> => {
  if (!error) return ok(undefined);
  const code = error.status === 401 ? 'unauthorized' : error.status === 422 ? 'validation' : 'internal';
  return err(appError(code, error.message ?? 'Authentication failed'));
};

/** Better Auth implementation of the client-side auth port. */
export const createBetterAuthClientAdapter = (baseUrl: string): AuthClientPort => {
  const client = createAuthClient({
    baseURL: baseUrl === '' ? undefined : baseUrl,
    plugins: [organizationClient()],
  });

  return {
    signUp: async ({ name, email, password }) =>
      toResult((await client.signUp.email({ name, email, password })).error),
    signIn: async ({ email, password }) =>
      toResult((await client.signIn.email({ email, password })).error),
    signOut: async () => toResult((await client.signOut()).error),
  };
};
