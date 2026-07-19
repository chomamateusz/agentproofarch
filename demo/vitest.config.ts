import { configDefaults, defineConfig } from 'vitest/config';

// Integration tests hit a real Postgres and are opt-in: the default `vitest run`
// (npm run test / test:coverage) must stay database-free for the CI check job.
// Enabling `VITEST_INTEGRATION=1` adds the `integration` project; the `node`
// project always excludes *.integration.test.ts so they never leak into a
// default run (they still match the `**/*.test.ts` glob).
const integrationEnabled = process.env['VITEST_INTEGRATION'] === '1';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      include: [
        'core/**/*.ts',
        'core/**/*.tsx',
        'adapters/**/*.ts',
        'adapters/**/*.tsx',
        'apps/**/*.ts',
        'apps/**/*.tsx',
        'scripts/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        'apps/web/src/main.tsx',
        'adapters/db/auth-schema.ts',
        'drizzle/**',
        'eslint-plugin-agentproofarch/**',
        // e2e-only orchestration (drop/create/migrate/seed a throwaway DB, boot
        // the real server): it has no database-free unit surface and is exercised
        // by the `e2e` CI job's real browser, so counting it as 0% would falsely
        // depress the database-free ratchet floor below.
        'scripts/e2e-server.ts',
        // Smoke-gate orchestration, same rationale: these boot the real server /
        // drive a real deploy through the CLI (`npm run smoke` / `smoke:remote`),
        // so they have no database-free unit surface and are exercised by the
        // smoke CI job — counting them as 0% would falsely depress the floor.
        'scripts/smoke.ts',
        'scripts/smoke-cli.ts',
        'scripts/smoke-remote.ts',
      ],
      // Ratchet floor, not aspiration: each threshold is the measured coverage
      // of the default (database-free) `vitest run --coverage` on 2026-07-19
      // (stmts/lines 76.01, branches 91.28, funcs 83.05), rounded DOWN to the
      // whole percent. A regression below the floor fails `npm run check`;
      // raise the floor whenever coverage climbs. Integration-only files
      // (repositories.ts, cards-repository.ts, migrate.ts, …) read 0% here
      // because they are covered by `test:integration`, which runs where
      // Postgres exists (CI smoke job).
      thresholds: {
        statements: 76,
        branches: 91,
        functions: 83,
        lines: 76,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'core/**/*.test.ts',
            'core/**/*.test.tsx',
            'adapters/**/*.test.ts',
            'adapters/**/*.test.tsx',
            'apps/cli/**/*.test.ts',
            'apps/cli/**/*.test.tsx',
            'apps/server/**/*.test.ts',
            'apps/server/**/*.test.tsx',
            'scripts/**/*.test.ts',
            'eslint-plugin-agentproofarch/**/*.test.js',
            // Island cores are pure TS (architecture.md §Client application
            // state): their unit tests run here, in plain node — no jsdom —
            // so TUI portability is exercised on every `check`.
            'apps/web/src/features/*/core/**/*.test.ts',
          ],
          exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          // jsdom + msw + user-event under parallel CI CPU load intermittently
          // pushes render/settle waits past the 5s default; 15s removes the
          // flake without masking a genuinely hung test.
          testTimeout: 15_000,
          include: ['apps/web/**/*.test.ts', 'apps/web/**/*.test.tsx'],
          exclude: [...configDefaults.exclude, 'apps/web/src/features/*/core/**/*.test.ts'],
          setupFiles: ['apps/web/src/test/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'config',
          environment: 'node',
          include: ['config-regression/**/*.test.ts'],
        },
      },
      ...(integrationEnabled
        ? [
            {
              extends: true as const,
              test: {
                name: 'integration',
                environment: 'node',
                include: ['adapters/**/*.integration.test.ts'],
              },
            },
          ]
        : []),
    ],
  },
});
