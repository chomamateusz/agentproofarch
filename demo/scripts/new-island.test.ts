import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import * as ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateIsland } from './new-island.js';
import { ResourceNameError } from './new-resource.js';

const demoRoot = join(import.meta.dirname, '..');

let sandbox: string;

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'new-island-'));
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const parses = (fileName: string, contents: string): readonly ts.Diagnostic[] => {
  const result = ts.transpileModule(contents, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      ...(fileName.endsWith('.tsx') ? { jsx: ts.JsxEmit.Preserve } : {}),
    },
  });
  return result.diagnostics ?? [];
};

const contentsOf = (files: readonly { path: string; contents: string }[], suffix: string): string =>
  files.find((file) => file.path.endsWith(suffix))?.contents ?? '';

describe('generateIsland', () => {
  it('renders every island file with valid, fully-substituted TypeScript', () => {
    const result = generateIsland({ name: 'personal-board', outDir: sandbox, repoRoot: sandbox });

    expect(result.files.map((file) => file.path)).toEqual([
      'apps/web/src/features/personal-board/core/events.ts',
      'apps/web/src/features/personal-board/core/selectors.ts',
      'apps/web/src/features/personal-board/core/index.ts',
      'apps/web/src/features/personal-board/core/personal-board.test.ts',
      'apps/web/src/features/personal-board/PersonalBoardPage.tsx',
      'apps/web/src/routes/personal-board.tsx',
    ]);

    for (const file of result.files) {
      const written = readFileSync(join(sandbox, file.path), 'utf8');
      expect(written).toBe(file.contents);
      expect(written).not.toMatch(/__[A-Z_]+__/);
      const diagnostics = parses(file.path, written).filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      );
      expect(diagnostics, `${file.path} should parse without syntax errors`).toEqual([]);
    }
  });

  it('generates the events-in / selectors-out seam a view talks to', () => {
    const { files } = generateIsland({
      name: 'team-board',
      outDir: sandbox,
      repoRoot: sandbox,
      dryRun: true,
    });

    expect(contentsOf(files, 'core/events.ts')).toContain('export type TeamBoardEvent');
    expect(contentsOf(files, 'core/events.ts')).toContain("type: 'refreshRequested'");
    expect(contentsOf(files, 'core/selectors.ts')).toContain('export const teamBoardSelectors');
    expect(contentsOf(files, 'core/index.ts')).toContain('export const send');
    expect(contentsOf(files, 'core/index.ts')).toContain('teamBoardSelectors');
    // The view talks only to the core seam, never api.ts directly.
    const page = contentsOf(files, 'TeamBoardPage.tsx');
    expect(page).toContain("from './core/index.js'");
    expect(page).toContain("send({ type: 'refreshRequested' })");
    expect(page).not.toContain('api.js');
  });

  it('emits a checklist that wires shared files, stays RED, and defers the machine to the spike', () => {
    const { checklist } = generateIsland({
      name: 'gadget-board',
      outDir: sandbox,
      repoRoot: sandbox,
      dryRun: true,
    });
    expect(checklist).toContain('npm run check` will stay RED');
    expect(checklist).toContain('apps/web/src/api.ts');
    expect(checklist).toContain('apps/web/src/main.tsx');
    expect(checklist).toContain('rung 2 = island store');
    expect(checklist).toContain('rung 3 = statechart (XState)');
    expect(checklist).toContain('DECISION-PENDING THE SPIKE');
    expect(checklist).toContain('npm run check && npm run smoke');
  });

  it('does not write files in dry-run mode', () => {
    generateIsland({ name: 'sprocket-board', outDir: sandbox, repoRoot: sandbox, dryRun: true });
    expect(() =>
      readFileSync(join(sandbox, 'apps/web/src/features/sprocket-board/core/index.ts'), 'utf8'),
    ).toThrow();
  });

  it('rejects non-kebab and empty names', () => {
    for (const bad of ['PersonalBoard', 'personal_board', '', '-board', 'board-']) {
      expect(() =>
        generateIsland({ name: bad, outDir: sandbox, repoRoot: sandbox, dryRun: true }),
      ).toThrow(ResourceNameError);
    }
  });

  it('refuses reserved island names that collide with existing features', () => {
    expect(() => generateIsland({ name: 'todos', outDir: sandbox, repoRoot: demoRoot })).toThrow(
      ResourceNameError,
    );
  });

  it('refuses to overwrite an existing file', () => {
    const collidingRoot = mkdtempSync(join(tmpdir(), 'new-island-collide-'));
    try {
      const indexFile = join(collidingRoot, 'apps/web/src/features/widget-board/core/index.ts');
      mkdirSync(dirname(indexFile), { recursive: true });
      writeFileSync(indexFile, 'export const send = () => {};\n');
      expect(() =>
        generateIsland({ name: 'widget-board', outDir: collidingRoot, repoRoot: collidingRoot }),
      ).toThrow(ResourceNameError);
    } finally {
      rmSync(collidingRoot, { recursive: true, force: true });
    }
  });
});
