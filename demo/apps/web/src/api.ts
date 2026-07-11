import { createBetterAuthClientAdapter } from '@adapters/auth/client-adapter.js';
import {
  addTodoInvalidates,
  addTodoMutation,
  createApiClient,
  meQuery,
  orgsQuery,
  signInMutation,
  signOutMutation,
  signUpMutation,
  todosQuery,
} from '@core/client/index.js';

/** Same-origin: the SPA is always served from the tenant's own domain. */
const apiClient = createApiClient({ baseUrl: '' });
const authClient = createBetterAuthClientAdapter('');

/**
 * The one binding site. Core/client action factories are bound to their
 * transport (ApiClient, AuthClientPort) exactly once here; features import
 * these ready actions and never see a client, a port or an adapter.
 */
export const actions = {
  me: meQuery(apiClient),
  orgs: orgsQuery(apiClient),
  todos: todosQuery(apiClient),
  addTodo: addTodoMutation(apiClient),
  addTodoInvalidates,
  signUp: signUpMutation(authClient),
  signIn: signInMutation(authClient),
  signOut: signOutMutation(authClient),
};
