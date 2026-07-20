import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { EXIT_CODE_BY_ERROR_CODE } from '#core/contract/index.js';
import { probeSignInCookies } from '#adapters/auth/client-adapter.js';

export const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
export const tsxBin = join(rootDir, 'node_modules/.bin/tsx');

export class SmokeFailure extends Error {}
export const fail = (message: string): never => {
  throw new SmokeFailure(message);
};
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new SmokeFailure(message);
}
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface Run {
  code: number;
  stdout: string;
  stderr: string;
}
export const run = (cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<Run> =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: rootDir, env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (cause) => resolve({ code: 1, stdout, stderr: `${stderr}${String(cause)}` }));
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });

const okEnvelope = z.object({ ok: z.literal(true), data: z.unknown() });
const errEnvelope = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});
const envelope = z.discriminatedUnion('ok', [okEnvelope, errEnvelope]);

const healthSchema = z.object({
  status: z.string(),
  database: z.string(),
  version: z.string(),
  sha: z.string(),
});
const todoItemSchema = z.object({ id: z.string(), title: z.string() });
const todosSchema = z.object({ todos: z.array(todoItemSchema) });
const addSchema = z.object({ todo: todoItemSchema });

const cardItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  board: z.string(),
  column: z.string(),
  position: z.number(),
  visited: z.array(z.string()),
});
const cardsSchema = z.object({ cards: z.array(cardItemSchema) });
const cardWriteSchema = z.object({ card: cardItemSchema });

const readEnvelope = (result: Run, label: string): unknown => {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return fail(
      `${label}: stdout was not a JSON envelope.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
};
const expectOk = (result: Run, label: string): unknown => {
  assert(
    result.code === 0,
    `${label}: expected exit 0, got ${result.code}.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  const parsed = envelope.parse(readEnvelope(result, label));
  assert(parsed.ok, `${label}: expected an ok envelope, got an error.`);
  return parsed.data;
};
const expectError = (
  result: Run,
  label: string,
  exitCode: number,
  errorCode: string,
): { code: string; message: string } => {
  assert(
    result.code === exitCode,
    `${label}: expected exit ${exitCode}, got ${result.code}.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  const parsed = envelope.parse(readEnvelope(result, label));
  assert(!parsed.ok, `${label}: expected an error envelope, got ok.`);
  assert(
    parsed.error.code === errorCode,
    `${label}: expected error code "${errorCode}", got "${parsed.error.code}".`,
  );
  return parsed.error;
};

export interface SmokeTarget {
  baseUrl: string;
  email: string;
  password: string;
  tenant: string;
  /** Deploy attestation: when set, health.sha must equal it (right deploy verified). */
  expectedSha?: string;
}

/**
 * Security/caching headers are part of the runtime contract (architecture
 * §Security baseline, §HTTP caching): tenant-scoped JSON is never stored by
 * any cache, and the security headers must survive every deploy target.
 */
const assertResponseHeaders = async (baseUrl: string): Promise<void> => {
  const response = await fetch(`${baseUrl}/api/health`);
  const cacheControl = response.headers.get('cache-control') ?? '(missing)';
  assert(
    cacheControl === 'no-store',
    `API cache-control must be "no-store", got "${cacheControl}"`,
  );
  const nosniff = response.headers.get('x-content-type-options') ?? '(missing)';
  assert(nosniff === 'nosniff', `x-content-type-options must be "nosniff", got "${nosniff}"`);
  const csp = response.headers.get('content-security-policy') ?? '(missing)';
  assert(
    csp.includes("script-src 'self'"),
    `content-security-policy must pin script-src 'self', got "${csp}"`,
  );
  // CSRF/CORS doctrine (architecture §Security baseline): no CORS middleware on
  // the authenticated /api/* surface, so no Access-Control-Allow-Origin may
  // appear. Mounting cors() here would regress the same-origin session boundary.
  const acao = response.headers.get('access-control-allow-origin');
  assert(
    acao === null,
    `authenticated /api/* must not enable CORS, got access-control-allow-origin: "${acao}"`,
  );
};

/**
 * The SPA shell must carry Vercel's revalidate-always default explicitly on
 * self-host (architecture §HTTP caching): hashed assets are immutable, but
 * index.html is served with `public, max-age=0, must-revalidate` so a new
 * deploy is picked up immediately. Parity with the `vercel.json` behaviour.
 */
const assertIndexHtmlCacheHeader = async (baseUrl: string): Promise<void> => {
  const response = await fetch(`${baseUrl}/`);
  assert(response.ok, `GET / (index.html) must serve the SPA shell, got ${response.status}`);
  const cacheControl = response.headers.get('cache-control') ?? '(missing)';
  assert(
    cacheControl === 'public, max-age=0, must-revalidate',
    `index.html cache-control must be "public, max-age=0, must-revalidate" (Vercel revalidate-always parity), got "${cacheControl}"`,
  );
};

/**
 * The session cookie's hardening is the load-bearing half of the CSRF/CORS
 * doctrine (architecture §Security baseline): the primary session boundary is
 * `SameSite=Lax` cookies on a same-origin SPA with **no** CORS middleware on the
 * authenticated `/api/*` surface — so a cross-site page cannot ride the session.
 * Adding `cors()` or relaxing `SameSite` would silently regress that boundary,
 * so we assert the attributes Better Auth actually emits on a live sign-in. The
 * sign-in is a raw POST (not the CLI, which authenticates by bearer token) so
 * the assertion reads the real `Set-Cookie` a browser would receive. `Secure` is
 * required only on https — it is off by design on plaintext `*.localhost` dev.
 */
const assertSessionCookieHardening = async (target: SmokeTarget): Promise<void> => {
  const { baseUrl } = target;
  const probe = await probeSignInCookies(baseUrl, {
    email: target.email,
    password: target.password,
  });
  assert(probe.ok, `sign-in for the cookie assertion failed: ${probe.status} ${probe.body}`);
  const cookies = probe.setCookie;
  const sessionCookie = cookies.find((cookie) => /session_token=/i.test(cookie));
  assert(
    sessionCookie !== undefined,
    `sign-in set no session cookie; Set-Cookie: ${cookies.join(' | ') || '(none)'}`,
  );
  const attributes = sessionCookie.split(';').map((part) => part.trim().toLowerCase());
  assert(attributes.includes('httponly'), `session cookie must be HttpOnly: ${sessionCookie}`);
  assert(
    attributes.includes('samesite=lax'),
    `session cookie must be SameSite=Lax (the CSRF boundary): ${sessionCookie}`,
  );
  const isHttps = new URL(baseUrl).protocol === 'https:';
  assert(
    attributes.includes('secure') === isHttps,
    `session cookie Secure flag must match the transport (https=${isHttps}): ${sessionCookie}`,
  );
};

/**
 * The runtime contract every deploy target must satisfy, driven purely through
 * the CLI: health → sign-in → todos list/add/list → cards add/list/move (→done)
 * (verifying the moved card persists at its new column and index) → the team
 * board (add lands in todo → illegal todo→done rejected with a named rule at
 * exit 2 → the full legal chain todo→in-dev→review→done at exit 0 → list
 * surfaces board + visited) → unauthorized (exit 3), plus the security/caching
 * response headers and the session-cookie hardening assertion.
 *
 * Non-self-poisoning property (architecture §Environments, smoke-account
 * doctrine): every card this run creates is parked in an **unbounded** column
 * (`done` on both boards — absent from `TEAM_WIP_LIMITS`) before the run ends, so
 * repeated production runs can never saturate the `in-dev`/`review` WIP limits
 * and turn the deploy gate false-red.
 * `homes` collects the temp HOME dirs so the caller can clean them up.
 */
export const driveCli = async (target: SmokeTarget, homes: string[]): Promise<void> => {
  const { baseUrl } = target;
  await assertResponseHeaders(baseUrl);
  await assertIndexHtmlCacheHeader(baseUrl);
  await assertSessionCookieHardening(target);
  const authedHome = mkdtempSync(join(tmpdir(), 'smoke-cli-'));
  const anonHome = mkdtempSync(join(tmpdir(), 'smoke-anon-'));
  homes.push(authedHome, anonHome);
  const cli = (args: string[], home: string): Promise<Run> =>
    run(tsxBin, ['apps/cli/src/main.ts', ...args], { HOME: home });

  const health = healthSchema.parse(
    expectOk(await cli(['--json', '--api-url', baseUrl, 'health'], authedHome), 'health'),
  );
  assert(
    health.status === 'ok' && health.database === 'up',
    `health degraded: status=${health.status} database=${health.database}`,
  );
  // Deploy attestation: prove this smoke ran against the exact commit the deploy
  // event carried, closing the "smoke verified the wrong deployment" class.
  if (target.expectedSha !== undefined) {
    assert(
      health.sha === target.expectedSha,
      `health SHA mismatch: expected ${target.expectedSha}, deployment reports ${health.sha}`,
    );
  }

  expectOk(
    await cli(
      ['--json', '--api-url', baseUrl, 'login', '--email', target.email, '--password', target.password],
      authedHome,
    ),
    'login',
  );

  const before = todosSchema.parse(
    expectOk(
      await cli(['--json', '--api-url', baseUrl, '--tenant', target.tenant, 'todo', 'list'], authedHome),
      'todo list (before)',
    ),
  );

  const title = `smoke check ${randomUUID()}`;
  const added = addSchema.parse(
    expectOk(
      await cli(
        ['--json', '--api-url', baseUrl, '--tenant', target.tenant, 'todo', 'add', title],
        authedHome,
      ),
      'todo add',
    ),
  );
  assert(added.todo.title === title, `todo add echoed the wrong title: ${added.todo.title}`);

  const after = todosSchema.parse(
    expectOk(
      await cli(['--json', '--api-url', baseUrl, '--tenant', target.tenant, 'todo', 'list'], authedHome),
      'todo list (after)',
    ),
  );
  assert(
    after.todos.some((todo) => todo.id === added.todo.id),
    'the added todo did not appear in the second list',
  );
  assert(
    after.todos.length === before.todos.length + 1,
    `expected exactly one more todo (${before.todos.length} -> ${after.todos.length})`,
  );

  const cardTitle = `smoke card ${randomUUID()}`;
  const addedCard = cardWriteSchema.parse(
    expectOk(
      await cli(
        ['--json', '--api-url', baseUrl, '--tenant', target.tenant, 'card', 'add', '--column', 'doing', cardTitle],
        authedHome,
      ),
      'card add',
    ),
  );
  assert(
    addedCard.card.title === cardTitle && addedCard.card.column === 'doing',
    `card add echoed the wrong card: ${JSON.stringify(addedCard.card)}`,
  );

  const cardsAfterAdd = cardsSchema.parse(
    expectOk(
      await cli(['--json', '--api-url', baseUrl, '--tenant', target.tenant, 'card', 'list'], authedHome),
      'card list (after add)',
    ),
  );
  assert(
    cardsAfterAdd.cards.some((card) => card.id === addedCard.card.id && card.column === 'doing'),
    'the added card did not appear in "doing" in the card list',
  );

  const movedCard = cardWriteSchema.parse(
    expectOk(
      await cli(
        [
          '--json',
          '--api-url',
          baseUrl,
          '--tenant',
          target.tenant,
          'card',
          'move',
          addedCard.card.id,
          '--to',
          'todo',
          '--index',
          '0',
        ],
        authedHome,
      ),
      'card move',
    ),
  );
  assert(
    movedCard.card.column === 'todo' && movedCard.card.position === 0,
    `card move did not land at todo#0: ${JSON.stringify(movedCard.card)}`,
  );

  const cardsAfterMove = cardsSchema.parse(
    expectOk(
      await cli(['--json', '--api-url', baseUrl, '--tenant', target.tenant, 'card', 'list'], authedHome),
      'card list (after move)',
    ),
  );
  const persisted = cardsAfterMove.cards.find((card) => card.id === addedCard.card.id);
  assert(persisted !== undefined, 'the moved card vanished from the card list');
  assert(
    persisted.column === 'todo' && persisted.position === 0,
    `the moved card did not persist at todo#0: ${JSON.stringify(persisted)}`,
  );

  // Park the personal card in `done` (unbounded — the personal board has no WIP
  // limits) so this run leaves nothing that a later run's WIP guard could trip.
  const parkedCard = cardWriteSchema.parse(
    expectOk(
      await cli(
        ['--json', '--api-url', baseUrl, '--tenant', target.tenant, 'card', 'move', addedCard.card.id, '--to', 'done'],
        authedHome,
      ),
      'personal card move to done',
    ),
  );
  assert(
    parkedCard.card.column === 'done',
    `personal card did not park in done: ${JSON.stringify(parkedCard.card)}`,
  );

  // --- team board: ordered columns + WIP limits, enforced server-side ---
  const teamTitle = `smoke team ${randomUUID()}`;
  const teamCard = cardWriteSchema.parse(
    expectOk(
      await cli(
        ['--json', '--api-url', baseUrl, '--tenant', target.tenant, 'card', 'add', '--board', 'team', teamTitle],
        authedHome,
      ),
      'team card add',
    ),
  );
  assert(
    teamCard.card.board === 'team' &&
      teamCard.card.column === 'todo' &&
      teamCard.card.visited.includes('todo'),
    `team card add did not land in todo on the team board: ${JSON.stringify(teamCard.card)}`,
  );

  // Illegal: todo -> done skips the ordered path — rejected (validation, exit 2), rule named.
  const rejected = expectError(
    await cli(
      [
        '--json',
        '--api-url',
        baseUrl,
        '--tenant',
        target.tenant,
        'card',
        'move',
        teamCard.card.id,
        '--board',
        'team',
        '--to',
        'done',
      ],
      authedHome,
    ),
    'illegal team move todo->done',
    EXIT_CODE_BY_ERROR_CODE.validation,
    'validation',
  );
  assert(
    rejected.message.includes('rule'),
    `illegal team move did not name the broken rule: ${rejected.message}`,
  );

  // Legal: walk the full ordered chain todo -> in-dev -> review -> done (exit 0
  // each). The run leaves the card in `done`, which is absent from
  // TEAM_WIP_LIMITS (unbounded), so repeated production runs never accumulate in
  // the bounded `in-dev`/`review` columns and can never trip a WIP guard.
  const teamMove = async (to: string, label: string): Promise<void> => {
    const moved = cardWriteSchema.parse(
      expectOk(
        await cli(
          ['--json', '--api-url', baseUrl, '--tenant', target.tenant, 'card', 'move', teamCard.card.id, '--board', 'team', '--to', to],
          authedHome,
        ),
        label,
      ),
    );
    assert(moved.card.column === to, `${label} did not land in ${to}: ${JSON.stringify(moved.card)}`);
  };
  await teamMove('in-dev', 'legal team move todo->in-dev');
  await teamMove('review', 'legal team move in-dev->review');
  await teamMove('done', 'legal team move review->done');

  const teamCards = cardsSchema.parse(
    expectOk(
      await cli(
        ['--json', '--api-url', baseUrl, '--tenant', target.tenant, 'card', 'list', '--board', 'team'],
        authedHome,
      ),
      'team card list',
    ),
  );
  const teamPersisted = teamCards.cards.find((card) => card.id === teamCard.card.id);
  assert(teamPersisted !== undefined, 'the team card vanished from the team board list');
  assert(
    teamPersisted.board === 'team' &&
      teamPersisted.column === 'done' &&
      ['todo', 'in-dev', 'review'].every((column) => teamPersisted.visited.includes(column)),
    `team card list did not surface board/visited correctly: ${JSON.stringify(teamPersisted)}`,
  );

  expectError(
    await cli(['--json', '--api-url', baseUrl, '--tenant', target.tenant, 'todo', 'list'], anonHome),
    'unauthorized todo list',
    EXIT_CODE_BY_ERROR_CODE.unauthorized,
    'unauthorized',
  );
};
