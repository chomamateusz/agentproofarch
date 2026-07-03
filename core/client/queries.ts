import { unwrap, type ApiClient } from './http.js';

/**
 * Framework-agnostic query definitions (TanStack Query shape).
 * React (web) and any future client consume these; none redefines keys or fetchers.
 */
export const meQuery = (api: ApiClient) => ({
  queryKey: ['me'] as const,
  queryFn: async () => unwrap(await api.me()),
  retry: false,
});

export const orgsQuery = (api: ApiClient) => ({
  queryKey: ['orgs'] as const,
  queryFn: async () => unwrap(await api.listOrgs()),
});

export const todosQuery = (api: ApiClient) => ({
  queryKey: ['todos'] as const,
  queryFn: async () => unwrap(await api.listTodos()),
});
