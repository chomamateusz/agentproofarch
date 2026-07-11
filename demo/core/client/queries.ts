import type {
  DefaultError,
  FetchQueryOptions,
  MutationFunction,
  MutationKey,
  MutationOptions,
  QueryFunction,
  QueryKey,
} from '@tanstack/query-core';

import type { NewTodo } from '@core/domain/index.js';

import { unwrap, type ApiClient } from './http.js';

/**
 * Identity helpers that type descriptors against `@tanstack/query-core` option
 * types (never `@tanstack/react-query`, which `core/client` may not import).
 * They bind the `queryFn` result type to the key so `useQuery`/`useMutation`
 * infer `data`/`variables` at the call site without explicit generics.
 */
export type QueryDescriptor<TQueryFnData, TQueryKey extends QueryKey> = FetchQueryOptions<
  TQueryFnData,
  DefaultError,
  TQueryFnData,
  TQueryKey
> & { queryFn: QueryFunction<TQueryFnData, TQueryKey> };

export const defineQuery = <TQueryFnData, TQueryKey extends QueryKey>(
  descriptor: QueryDescriptor<TQueryFnData, TQueryKey>,
): QueryDescriptor<TQueryFnData, TQueryKey> => descriptor;

export type MutationDescriptor<TData, TVariables> = MutationOptions<
  TData,
  DefaultError,
  TVariables
> & { mutationKey: MutationKey; mutationFn: MutationFunction<TData, TVariables> };

export const defineMutation = <TData, TVariables>(
  descriptor: MutationDescriptor<TData, TVariables>,
): MutationDescriptor<TData, TVariables> => descriptor;

/**
 * Query keys are the public API of each resource: general → specific, matched
 * by prefix for invalidation and per-prefix defaults. Never hand-copy a key.
 */
export const meScopes = {
  all: () => ['me'] as const,
};

export const orgsScopes = {
  all: () => ['orgs'] as const,
};

export const todosScopes = {
  all: () => ['todos'] as const,
  lists: () => ['todos', 'list'] as const,
};

export const meQuery = (api: ApiClient) =>
  defineQuery({
    queryKey: meScopes.all(),
    queryFn: async ({ signal }) => unwrap(await api.me(signal)),
  });

export const orgsQuery = (api: ApiClient) =>
  defineQuery({
    queryKey: orgsScopes.all(),
    queryFn: async ({ signal }) => unwrap(await api.listOrgs(signal)),
  });

export const todosQuery = (api: ApiClient) =>
  defineQuery({
    queryKey: todosScopes.lists(),
    queryFn: async ({ signal }) => unwrap(await api.listTodos(signal)),
  });

export const addTodoMutation = (api: ApiClient) =>
  defineMutation({
    mutationKey: [...todosScopes.all(), 'create'],
    mutationFn: async (input: NewTodo) => unwrap(await api.addTodo(input)),
  });

/** The invalidation filter `addTodoMutation` applies after it settles. */
export const addTodoInvalidates = () => ({ queryKey: todosScopes.lists() });
