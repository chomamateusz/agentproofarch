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
      ],
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
            'eslint-plugin-agentproofarch/**/*.test.js',
          ],
          exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/**/*.test.ts', 'apps/web/**/*.test.tsx'],
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
