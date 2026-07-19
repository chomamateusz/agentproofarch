import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Behavioral config-regression probes for the machine-agnostic island-core
 * enforcement. No `features/<name>/core/` exists in the demo yet, so each probe
 * writes a deliberately-illegal fixture into the real tree at the exact path an
 * island core will occupy, runs the real linter, and asserts the specific
 * ruleId fires — proving the rules bite on FUTURE files. Fixtures live under a
 * per-run token feature and are always removed.
 */

const demoRoot = join(import.meta.dirname, '..');
const token = `__aparch_island_probe_${process.pid}_${Date.now()}__`;
const featureRoot = join('apps', 'web', 'src', 'features', token);
const coreDir = join(featureRoot, 'core');

const featuresBase = join(demoRoot, 'apps', 'web', 'src', 'features');

const sweep = () => {
  for (const entry of readdirSync(featuresBase, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('__aparch_island_probe_')) {
      rmSync(join(featuresBase, entry.name), { recursive: true, force: true });
    }
  }
};

const fixtures = {
  eventSuffix: {
    rel: join(coreDir, 'events.ts'),
    content: "export type BoardEvent = { type: 'deleteCard' } | { type: 'cardMoved' };\n",
  },
  reactInCore: {
    rel: join(coreDir, 'react-probe.ts'),
    content: "import 'react';\nexport const probe = 1;\n",
  },
  reactQueryInCore: {
    rel: join(coreDir, 'rq-probe.ts'),
    content: "import '@tanstack/react-query';\nexport const probe = 1;\n",
  },
  persistInCore: {
    rel: join(coreDir, 'persist-probe.ts'),
    content: "import { persist } from 'zustand/middleware';\nexport const probe = persist;\n",
  },
  storageInCore: {
    rel: join(coreDir, 'storage-probe.ts'),
    content: "export const probe = localStorage.getItem('k');\n",
  },
  setQueryData: {
    rel: join(coreDir, 'set-query-data-probe.ts'),
    content: "export const write = (qc) => qc.setQueryData(['probe'], 1);\n",
  },
  // Exemption: the same setQueryData call inside an optimistic.ts must NOT fire.
  optimisticAllowed: {
    rel: join(coreDir, 'optimistic.ts'),
    content: "export const write = (qc) => qc.setQueryData(['probe'], 1);\n",
  },
} satisfies Record<string, { rel: string; content: string }>;

interface EslintMessage {
  ruleId: string | null;
  message: string;
}
interface EslintResult {
  filePath: string;
  messages: EslintMessage[];
}

const messagesByFixture = new Map<string, EslintMessage[]>();

const write = (rel: string, content: string) => {
  const abs = join(demoRoot, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  return abs;
};

const messagesOf = (fixtureKey: keyof typeof fixtures): EslintMessage[] =>
  messagesByFixture.get(fixtures[fixtureKey].rel) ?? [];

const has = (fixtureKey: keyof typeof fixtures, ruleId: string, needle: string): boolean =>
  messagesOf(fixtureKey).some((m) => m.ruleId === ruleId && m.message.includes(needle));

beforeAll(() => {
  sweep();
  const allFixtures = Object.values(fixtures);
  const targets = allFixtures.map((fixture) => write(fixture.rel, fixture.content));

  const eslintBin = join(demoRoot, 'node_modules', '.bin', 'eslint');
  const run = spawnSync(eslintBin, ['--format', 'json', ...targets], {
    cwd: demoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const results: EslintResult[] = JSON.parse(run.stdout);
  for (const result of results) {
    for (const fixture of allFixtures) {
      if (result.filePath === join(demoRoot, fixture.rel)) {
        messagesByFixture.set(fixture.rel, result.messages);
      }
    }
  }
}, 60_000);

afterAll(() => {
  rmSync(join(demoRoot, featureRoot), { recursive: true, force: true });
  sweep();
});

describe('island-core lint gate rejects violations on future core files', () => {
  it('event-suffix-taxonomy fires on an imperative event name in core/events.ts', () => {
    expect(has('eventSuffix', 'agentproofarch/event-suffix-taxonomy', 'deleteCard')).toBe(true);
  });

  it('bans react imports in island cores (pure TS)', () => {
    expect(has('reactInCore', 'no-restricted-imports', 'pure TypeScript')).toBe(true);
  });

  it('bans @tanstack/react-query imports in island cores', () => {
    expect(has('reactQueryInCore', 'no-restricted-imports', 'pure TypeScript')).toBe(true);
  });

  it('bans zustand persist middleware in island cores (state dies on reload)', () => {
    expect(has('persistInCore', 'no-restricted-imports', 'reload')).toBe(true);
  });

  it('bans localStorage in island cores (extends the existing web-api handling)', () => {
    expect(has('storageInCore', 'no-restricted-globals', 'localStorage')).toBe(true);
  });

  it('bans queryClient.setQueryData outside optimistic.ts', () => {
    expect(has('setQueryData', 'no-restricted-syntax', 'optimistic.ts')).toBe(true);
  });

  it('permits queryClient.setQueryData inside an optimistic.ts', () => {
    expect(
      messagesOf('optimisticAllowed').some((m) => m.message.includes('setQueryData')),
    ).toBe(false);
  });
});
