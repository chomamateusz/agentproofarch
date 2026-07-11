import js from '@eslint/js';
import tanstackQuery from '@tanstack/eslint-plugin-query';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactCompiler from 'eslint-plugin-react-compiler';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

/**
 * Layer boundaries (PRD §3.2). `boundaries/element-types` denies everything by
 * default; each rule below is an explicit permission. dependency-cruiser
 * double-checks the same graph plus vendor bans in `npm run depcruise`.
 */
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'drizzle/**'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        document: 'readonly',
        process: 'readonly',
      },
    },
    rules: js.configs.recommended.rules,
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
      },
    },
    rules: js.configs.recommended.rules,
  },
  ...tseslint.configs.strict,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'core-domain', pattern: 'core/domain/**', mode: 'full' },
        { type: 'core-contract', pattern: 'core/contract/**', mode: 'full' },
        { type: 'core-server', pattern: 'core/server/**', mode: 'full' },
        { type: 'core-client', pattern: 'core/client/**', mode: 'full' },
        { type: 'adapter-db', pattern: 'adapters/db/**', mode: 'full' },
        { type: 'adapter-auth', pattern: 'adapters/auth/**', mode: 'full' },
        { type: 'adapter-domains', pattern: 'adapters/domain-provisioning/**', mode: 'full' },
        { type: 'app-server', pattern: 'apps/server/**', mode: 'full' },
        { type: 'app-web', pattern: 'apps/web/**', mode: 'full' },
        { type: 'app-cli', pattern: 'apps/cli/**', mode: 'full' },
        { type: 'config', pattern: '*.config.ts', mode: 'full' },
      ],
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression:not([typeAnnotation.typeName.name="const"])',
          message: 'Type assertions (`as`) are forbidden; parse or narrow instead. `as const` is allowed.',
        },
      ],
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message: '${file.type} is not allowed to import ${dependency.type} (see PRD §3.2)',
          rules: [
            { from: ['core-domain'], allow: ['core-domain'] },
            { from: ['core-contract'], allow: ['core-domain', 'core-contract'] },
            { from: ['core-server'], allow: ['core-domain', 'core-server'] },
            { from: ['core-client'], allow: ['core-domain', 'core-contract', 'core-client'] },
            {
              from: ['adapter-db', 'adapter-auth', 'adapter-domains'],
              allow: [
                'core-domain',
                'core-server',
                'core-client',
                'adapter-db',
                'adapter-auth',
                'adapter-domains',
              ],
            },
            {
              from: ['app-server'],
              allow: [
                'core-domain',
                'core-contract',
                'core-server',
                'adapter-db',
                'adapter-auth',
                'adapter-domains',
                'app-server',
              ],
            },
            {
              from: ['app-web'],
              allow: ['core-domain', 'core-contract', 'core-client', 'adapter-auth', 'app-web'],
            },
            {
              from: ['app-cli'],
              allow: ['core-domain', 'core-contract', 'core-client', 'app-cli'],
            },
          ],
        },
      ],
      'boundaries/external': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: ['core-domain', 'core-contract', 'core-server'],
              disallow: ['react', 'react-dom', 'hono', 'drizzle-orm', 'better-auth', 'pg', 'commander'],
              message: 'Core stays pure TypeScript: no frameworks, servers or drivers (PRD §3.1)',
            },
            {
              from: ['core-client'],
              disallow: ['react', 'react-dom', 'hono', 'drizzle-orm', 'better-auth', 'pg'],
              message: 'core/client is framework-agnostic (PRD §3.1)',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      '@tanstack/query': tanstackQuery,
      'jsx-a11y': jsxA11y,
      react,
      'react-compiler': reactCompiler,
      'react-hooks': reactHooks,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      '@tanstack/query/exhaustive-deps': 'error',
      '@tanstack/query/no-rest-destructuring': 'error',
      '@tanstack/query/stable-query-client': 'error',
      'react-compiler/react-compiler': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react/no-unstable-nested-components': 'error',
    },
  },
);
