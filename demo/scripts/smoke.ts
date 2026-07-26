import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import pg from 'pg';

import {
  assert,
  delay,
  driveCli,
  fail,
  rootDir,
  run,
  SmokeFailure,
  tsxBin,
} from './smoke-cli.js';
import { clearMailpit, waitForMailpit } from './mailpit.js';

const SMOKE_DB = 'agentproofarch_smoke';
// The dev/CI Mailpit (docker-compose.dev.yml): the real smtp adapter delivers
// here and the magic-link phase reads the message back over its HTTP API.
const MAILPIT_SMTP_PORT = 47925;
const MAILPIT_API_URL = 'http://localhost:47980';
const baseDatabaseUrl =
  process.env['DATABASE_URL'] ??
  'postgresql://agentproofarch:agentproofarch@localhost:47542/agentproofarch';
const smokeUrlObject = new URL(baseDatabaseUrl);
smokeUrlObject.pathname = `/${SMOKE_DB}`;
const smokeDatabaseUrl = smokeUrlObject.toString();

const dropOptionalDependencyEdges = (entry: readonly string[]): string[] => {
  const kept: string[] = [];
  let inOptionalEdges = false;
  for (const line of entry) {
    if (/^ {4}optionalDependencies:$/.test(line)) {
      inOptionalEdges = true;
      continue;
    }
    if (inOptionalEdges && /^ {6}\S/.test(line)) continue;
    inOptionalEdges = false;
    kept.push(line);
  }
  return kept;
};

// Platform-conditional optional entries (os/cpu/libc-gated packages such as
// esbuild binaries or fsevents) legitimately differ between the committed
// lockfile and what a non-linux host installed, so they are excluded from the
// comparison on BOTH sides; everything else — importers, settings, every
// unconditional package — must still match exactly.
const normalizeLockfile = (raw: string): string => {
  const out: string[] = [];
  let section = '';
  let entry: string[] = [];

  const flushEntry = (): void => {
    if (entry.length === 0) return;
    const platformConditional =
      section === 'packages:' && entry.some((line) => /^ {4}(?:os|cpu|libc): /.test(line));
    const optionalSnapshot =
      section === 'snapshots:' && entry.some((line) => /^ {4}optional: true$/.test(line));
    if (!platformConditional && !optionalSnapshot) {
      out.push(...(section === 'snapshots:' ? dropOptionalDependencyEdges(entry) : entry));
    }
    entry = [];
  };

  for (const line of raw.split('\n')) {
    if (/^\S/.test(line)) {
      flushEntry();
      section = line;
      out.push(line);
      continue;
    }
    if (section === 'packages:' || section === 'snapshots:') {
      if (/^ {2}\S/.test(line)) flushEntry();
      if (entry.length > 0 || /^ {2}\S/.test(line)) {
        entry.push(line);
        continue;
      }
    }
    out.push(line);
  }
  flushEntry();
  return out.join('\n');
};

const checkLockfileDrift = (): void => {
  const verification = spawnSync(
    'pnpm',
    ['install', '--frozen-lockfile', '--lockfile-only'],
    { cwd: rootDir, encoding: 'utf8' },
  );
  if (verification.status !== 0) {
    fail(
      `pnpm-lock.yaml does not match package.json:\n${verification.stdout}${verification.stderr}`,
    );
  }
  const source = readFileSync(join(rootDir, 'pnpm-lock.yaml'), 'utf8');
  let installed: string;
  try {
    installed = readFileSync(join(rootDir, 'node_modules/.pnpm/lock.yaml'), 'utf8');
  } catch {
    throw new SmokeFailure(
      'Dependencies are not installed (node_modules/.pnpm/lock.yaml missing). Run: pnpm install --frozen-lockfile',
    );
  }
  if (normalizeLockfile(installed) !== normalizeLockfile(source)) {
    fail(
      'Installed dependency tree does not match pnpm-lock.yaml. Run: pnpm install --frozen-lockfile',
    );
  }
};

const ephemeralPort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close(() => reject(new Error('Could not allocate an ephemeral port')));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });

const setupDatabase = async (adminUrl: string): Promise<void> => {
  const client = new pg.Client({ connectionString: adminUrl });
  try {
    await client.connect();
    // Fresh, isolated database each run so smoke never touches the dev-seeded data.
    await client.query(`DROP DATABASE IF EXISTS ${SMOKE_DB} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${SMOKE_DB}`);
  } catch (cause) {
    fail(
      `Could not prepare the smoke database "${SMOKE_DB}". Is the dev Postgres up (pnpm run db:up)?\n${String(cause)}`,
    );
  } finally {
    await client.end();
  }
};

const migrateAndSeed = async (databaseUrl: string): Promise<void> => {
  const migrate = await run(tsxBin, ['adapters/db/migrate.ts'], { DATABASE_URL: databaseUrl });
  assert(migrate.code === 0, `Migration failed:\n${migrate.stdout}${migrate.stderr}`);
  const seed = await run(tsxBin, ['adapters/db/seed.ts'], { DATABASE_URL: databaseUrl });
  assert(seed.code === 0, `Seed failed:\n${seed.stdout}${seed.stderr}`);
};

const bootServer = async (
  port: number,
  databaseUrl: string,
  webDistDir: string,
): Promise<ChildProcess> => {
  const child = spawn(tsxBin, ['apps/server/src/entry.node.ts'], {
    cwd: rootDir,
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      APP_BASE_URL: `http://localhost:${port}`,
      APP_BASE_DOMAIN: 'localhost',
      WEB_DIST_DIR: webDistDir,
      // Real smtp transport → the dev/CI Mailpit captures the magic-link send;
      // pinned here so a stray EMAIL_TRANSPORT in the ambient shell can't divert it.
      EMAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'localhost',
      SMTP_PORT: String(MAILPIT_SMTP_PORT),
      SMTP_SECURE: 'false',
    },
  });
  let logs = '';
  child.stdout?.on('data', (chunk) => {
    logs += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    logs += String(chunk);
  });
  let exitInfo: string | null = null;
  child.on('exit', (code, signal) => {
    exitInfo = `code=${String(code)} signal=${String(signal)}`;
  });

  const healthUrl = `http://localhost:${port}/api/health`;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (exitInfo !== null) {
      fail(`Server exited before becoming ready (${exitInfo}).\n--- server output ---\n${logs}`);
    }
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return child;
    } catch {
      // not accepting connections yet
    }
    await delay(300);
  }
  throw new SmokeFailure(
    `Server did not become ready within 20s on port ${port}.\n--- server output ---\n${logs}`,
  );
};

const killServer = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const { pid } = child;
  const signalGroup = (signal: NodeJS.Signals): void => {
    try {
      if (pid !== undefined) process.kill(-pid, signal);
    } catch {
      child.kill(signal);
    }
  };
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  signalGroup('SIGTERM');
  await Promise.race([exited, delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) signalGroup('SIGKILL');
};

const startedAt = Date.now();
const homes: string[] = [];
let server: ChildProcess | null = null;
try {
  console.log('smoke: checking lockfile drift...');
  checkLockfileDrift();
  console.log('smoke: preparing isolated database...');
  await setupDatabase(baseDatabaseUrl);
  await migrateAndSeed(smokeDatabaseUrl);
  console.log('smoke: waiting for Mailpit...');
  await waitForMailpit(MAILPIT_API_URL).catch((cause: unknown) => {
    fail(`Mailpit is not reachable at ${MAILPIT_API_URL}. Is it up (pnpm run db:up)?\n${String(cause)}`);
  });
  await clearMailpit(MAILPIT_API_URL);
  const port = await ephemeralPort();
  console.log(`smoke: booting server on port ${port}...`);
  const webDistDir = mkdtempSync(join(tmpdir(), 'smoke-web-'));
  homes.push(webDistDir);
  // Minimal SPA shell so the server serves index.html — smoke asserts its
  // revalidate-always cache header (Vercel parity) without a full web build.
  writeFileSync(join(webDistDir, 'index.html'), '<!doctype html><title>agentproofarch smoke</title>\n');
  server = await bootServer(port, smokeDatabaseUrl, webDistDir);
  console.log('smoke: driving the CLI...');
  await driveCli(
    {
      baseUrl: `http://localhost:${port}`,
      email: 'demo@agentproofarch.dev',
      password: 'demo1234',
      tenant: 'acme',
      mailpitApiUrl: MAILPIT_API_URL,
    },
    homes,
  );
  console.log(`\nsmoke: PASS (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
} catch (error) {
  const message = error instanceof SmokeFailure ? error.message : String(error);
  console.error(`\nsmoke: FAIL\n${message}`);
  process.exitCode = 1;
} finally {
  if (server) await killServer(server);
  for (const dir of homes) rmSync(dir, { recursive: true, force: true });
}
