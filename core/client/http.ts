import { z } from 'zod';

import {
  API_PATHS,
  looseEnvelopeSchema,
  healthOutputSchema,
  meOutputSchema,
  orgListOutputSchema,
  todoCreateOutputSchema,
  todoListOutputSchema,
} from '@core/contract/index.js';
import { err, internal, ok, type AppError, type NewTodo, type Result } from '@core/domain/index.js';

export interface ApiClientOptions {
  /** '' for same-origin (web); absolute URL for CLI and other clients. */
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Extra headers per request: Authorization bearer token, X-Tenant, ... */
  headers?: () => Record<string, string>;
}

const request = async <S extends z.ZodTypeAny>(
  options: ApiClientOptions,
  method: 'GET' | 'POST',
  path: string,
  outputSchema: S,
  body?: unknown,
): Promise<Result<z.output<S>, AppError>> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${options.baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers?.(),
      },
      body: body === undefined ? null : JSON.stringify(body),
      credentials: 'include',
    });
  } catch (cause) {
    return err(internal(`Network error calling ${path}: ${String(cause)}`));
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return err(internal(`Non-JSON response from ${path} (HTTP ${response.status})`));
  }

  const envelope = looseEnvelopeSchema.safeParse(payload);
  if (!envelope.success) {
    return err(internal(`Response from ${path} does not match the contract envelope`));
  }
  if (!envelope.data.ok) return err(envelope.data.error);

  const data = outputSchema.safeParse(envelope.data.data);
  if (!data.success) {
    return err(internal(`Response data from ${path} does not match the contract`));
  }
  return ok(data.data);
};

/** The single typed gateway to the API. No client ever hand-writes HTTP. */
export const createApiClient = (options: ApiClientOptions) => ({
  health: () => request(options, 'GET', API_PATHS.health, healthOutputSchema),
  me: () => request(options, 'GET', API_PATHS.me, meOutputSchema),
  listOrgs: () => request(options, 'GET', API_PATHS.orgs, orgListOutputSchema),
  listTodos: () => request(options, 'GET', API_PATHS.todos, todoListOutputSchema),
  addTodo: (input: NewTodo) => request(options, 'POST', API_PATHS.todos, todoCreateOutputSchema, input),
});

export type ApiClient = ReturnType<typeof createApiClient>;

/** For TanStack Query: converts a Result into value-or-throw at the query boundary. */
export const unwrap = <T>(result: Result<T, AppError>): T => {
  if (!result.ok) throw new ApiError(result.error);
  return result.value;
};

export class ApiError extends Error {
  readonly appError: AppError;

  constructor(appError: AppError) {
    super(appError.message);
    this.name = 'ApiError';
    this.appError = appError;
  }
}
