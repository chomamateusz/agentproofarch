import { Command } from 'commander';

import { TENANT_HEADER } from '@core/contract/index.js';
import {
  appError,
  err,
  internal,
  notFound,
  ok,
  unauthorized,
  type AppError,
  type Result,
} from '@core/domain/index.js';
import { createApiClient, type ApiClient } from '@core/client/index.js';

import { loadConfig, saveConfig, type CliConfig } from './config.js';
import { emit } from './output.js';

const program = new Command('agentproofarch')
  .description('Reference client for the agentproofarch API — the agent feedback loop')
  .option('--json', 'machine-readable JSON output', false)
  .option('--api-url <url>', 'API base URL (overrides config)')
  .option('--tenant <slug>', 'tenant slug for this invocation (overrides config)');

interface CliCtx {
  config: CliConfig;
  api: ApiClient;
  apiUrl: string;
  tenant: string | null;
  json: boolean;
}

const cliCtx = (): CliCtx => {
  const config = loadConfig();
  const globals = program.opts<{ json: boolean; apiUrl?: string; tenant?: string }>();
  const apiUrl = globals.apiUrl ?? config.apiUrl;
  const tenant = globals.tenant ?? config.tenant;
  const api = createApiClient({
    baseUrl: apiUrl,
    headers: () => ({
      ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
      ...(tenant ? { [TENANT_HEADER]: tenant } : {}),
    }),
  });
  return { config, api, apiUrl, tenant, json: globals.json };
};

/** Auth endpoints are served by Better Auth, outside our contract; wrap them once here. */
const authRequest = async (
  ctx: CliCtx,
  path: string,
  body: Record<string, string>,
): Promise<Result<{ token: string | null }, AppError>> => {
  let response: Response;
  try {
    response = await fetch(`${ctx.apiUrl}${path}`, {
      method: 'POST',
      // Better Auth CSRF protection expects an Origin; ours is trusted by config.
      headers: { 'content-type': 'application/json', origin: ctx.apiUrl },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    return err(internal(`Network error calling ${path}: ${String(cause)}`));
  }
  if (!response.ok) {
    const detail: unknown = await response.json().catch(() => null);
    const message =
      detail !== null && typeof detail === 'object' && 'message' in detail
        ? String(detail.message)
        : `Auth request failed (HTTP ${response.status})`;
    return err(response.status === 401 ? unauthorized(message) : appError('validation', message));
  }
  return ok({ token: response.headers.get('set-auth-token') });
};

program.command('health').description('API and database status').action(async () => {
  const ctx = cliCtx();
  emit(await ctx.api.health(), ctx.json, (h) => `status=${h.status} db=${h.database} v${h.version}`);
});

program
  .command('register')
  .description('Create an account (and sign in)')
  .requiredOption('--name <name>')
  .requiredOption('--email <email>')
  .requiredOption('--password <password>')
  .action(async (options: { name: string; email: string; password: string }) => {
    const ctx = cliCtx();
    const result = await authRequest(ctx, '/api/auth/sign-up/email', options);
    if (result.ok && result.value.token) {
      saveConfig({ ...ctx.config, apiUrl: ctx.apiUrl, token: result.value.token });
    }
    emit(result, ctx.json, () => `registered and signed in as ${options.email}`);
  });

program
  .command('login')
  .description('Sign in and store the session token')
  .requiredOption('--email <email>')
  .requiredOption('--password <password>')
  .action(async (options: { email: string; password: string }) => {
    const ctx = cliCtx();
    const result = await authRequest(ctx, '/api/auth/sign-in/email', options);
    if (result.ok) {
      if (!result.value.token) {
        emit(err(internal('Server did not return a session token')), ctx.json, () => '');
        return;
      }
      saveConfig({ ...ctx.config, apiUrl: ctx.apiUrl, token: result.value.token });
    }
    emit(result, ctx.json, () => `signed in as ${options.email}`);
  });

program.command('logout').description('Drop the stored session token').action(() => {
  const ctx = cliCtx();
  saveConfig({ ...ctx.config, token: null });
  emit(ok({ loggedOut: true }), ctx.json, () => 'signed out');
});

program.command('whoami').description('Current user and active tenant').action(async () => {
  const ctx = cliCtx();
  emit(await ctx.api.me(), ctx.json, (me) =>
    me.tenant
      ? `${me.email} @ ${me.tenant.name} (${me.tenant.slug}, role: ${me.tenant.role})`
      : `${me.email} (no tenant selected)`,
  );
});

const org = program.command('org').description('Organizations (tenants)');

org.command('list').description('Organizations you belong to').action(async () => {
  const ctx = cliCtx();
  emit(await ctx.api.listOrgs(), ctx.json, (data) =>
    data.organizations.length === 0
      ? 'no organizations'
      : data.organizations
          .map((m) => `${m.tenant.slug}\t${m.tenant.name}\t(${m.role})`)
          .join('\n'),
  );
});

org
  .command('switch <slug>')
  .description('Set the active tenant for subsequent commands')
  .action(async (slug: string) => {
    const ctx = cliCtx();
    const orgs = await ctx.api.listOrgs();
    if (!orgs.ok) {
      emit(orgs, ctx.json, () => '');
      return;
    }
    const membership = orgs.value.organizations.find((m) => m.tenant.slug === slug);
    if (!membership) {
      emit(
        err(notFound(`You are not a member of any tenant with slug "${slug}"`)),
        ctx.json,
        () => '',
      );
      return;
    }
    saveConfig({ ...ctx.config, tenant: slug });
    emit(ok(membership), ctx.json, (m) => `active tenant: ${m.tenant.name} (${m.tenant.slug})`);
  });

const todo = program.command('todo').description('Todos in the active tenant');

todo.command('list').description('List todos').action(async () => {
  const ctx = cliCtx();
  emit(await ctx.api.listTodos(), ctx.json, (data) =>
    data.todos.length === 0
      ? 'no todos'
      : data.todos.map((t) => `- ${t.title}  (${t.id.slice(0, 8)})`).join('\n'),
  );
});

todo
  .command('add <title...>')
  .description('Add a todo')
  .action(async (titleWords: string[]) => {
    const ctx = cliCtx();
    emit(await ctx.api.addTodo({ title: titleWords.join(' ') }), ctx.json, (data) =>
      `added: ${data.todo.title} (${data.todo.id.slice(0, 8)})`,
    );
  });

await program.parseAsync(process.argv);
