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

  it('emits a checklist that wires shared files, stays RED, and routes graduation through --machine', () => {
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
    expect(checklist).toContain('RESOLVED (ADR-0005)');
    expect(checklist).toContain('--machine=store');
    expect(checklist).not.toContain('DECISION-PENDING');
    expect(checklist).toContain('npm run check && npm run smoke');
  });

  it('scaffolds a rung-2 store island and every file parses', () => {
    const result = generateIsland({
      name: 'kanban-board',
      outDir: sandbox,
      repoRoot: sandbox,
      machine: 'store',
    });

    expect(result.files.map((file) => file.path)).toEqual([
      'apps/web/src/features/kanban-board/core/events.ts',
      'apps/web/src/features/kanban-board/core/selectors.ts',
      'apps/web/src/features/kanban-board/core/store.ts',
      'apps/web/src/features/kanban-board/core/index.ts',
      'apps/web/src/features/kanban-board/core/kanban-board.test.ts',
      'apps/web/src/features/kanban-board/KanbanBoardPage.tsx',
      'apps/web/src/routes/kanban-board.tsx',
    ]);

    for (const file of result.files) {
      const written = readFileSync(join(sandbox, file.path), 'utf8');
      expect(written).not.toMatch(/__[A-Z_]+__/);
      const diagnostics = parses(file.path, written).filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      );
      expect(diagnostics, `${file.path} should parse without syntax errors`).toEqual([]);
    }

    const store = contentsOf(result.files, 'core/store.ts');
    // The @xstate/store `on` map IS the seam: a handler per domain event.
    expect(store).toContain("import { createStore } from '@xstate/store'");
    expect(store).toContain('export const createKanbanBoardStore');
    expect(store).toContain('itemAddRequested:');
    expect(store).toContain('export interface KanbanBoardGateway');
    // OVERLAY / intent-only (ADR-0005, mirrors the living board): the store holds
    // pending ops + a single undo + a committed-revision counter, never a copy of
    // the item list. The merge selector lays the overlay over the cache truth.
    expect(store).toContain('readonly pending: readonly PendingOp[]');
    expect(store).toContain('readonly committedRev: number');
    expect(store).toContain('export const kanbanBoardItemsOf');
    expect(store).toContain('getState(): KanbanBoardOverlayState');
    // No server-items copy: the store context never carries an items array.
    expect(store).not.toContain('items: readonly');
    // The toIndex-clamp finding: one shared clamp, and the SAME clamped value
    // feeds both the overlay op and the gateway (no raw payload on the wire).
    expect(store).toContain('const clamp');
    expect(store).toContain('Math.max(min, Math.min(value, max))');
    expect(store).toContain('.moveItem({ itemId: event.itemId, toIndex })');
    expect(store).not.toContain('toIndex: event.toIndex');
    // Events mirror the store handlers; the move carries what an overlay needs.
    expect(contentsOf(result.files, 'core/events.ts')).toContain("type: 'itemAddRequested'");
    expect(contentsOf(result.files, 'core/events.ts')).toContain('listSize: number');
    // index forwards send to the store and merges its selectors over the cache.
    const index = contentsOf(result.files, 'core/index.ts');
    expect(index).toContain('createKanbanBoardStore');
    expect(index).toContain('store.send(event)');
    expect(index).toContain('kanbanBoardItemsOf');
    expect(index).toContain('export const subscribe');
    // The store test drives the store with a fake gateway and merges the overlay.
    expect(contentsOf(result.files, 'core/kanban-board.test.ts')).toContain(
      'createKanbanBoardStore',
    );
    expect(contentsOf(result.files, 'core/kanban-board.test.ts')).toContain('kanbanBoardItemsOf');

    expect(result.checklist).toContain('RUNG 2');
    expect(result.checklist).toContain('@xstate/store');
    expect(result.checklist).toContain('GATEWAY');
  });

  it('scaffolds a rung-3 statechart island and every file parses', () => {
    const result = generateIsland({
      name: 'release-flow',
      outDir: sandbox,
      repoRoot: sandbox,
      machine: 'statechart',
    });

    expect(result.files.map((file) => file.path)).toEqual([
      'apps/web/src/features/release-flow/core/events.ts',
      'apps/web/src/features/release-flow/core/selectors.ts',
      'apps/web/src/features/release-flow/core/rules.ts',
      'apps/web/src/features/release-flow/core/machine.ts',
      'apps/web/src/features/release-flow/core/index.ts',
      'apps/web/src/features/release-flow/core/release-flow.test.ts',
      'apps/web/src/features/release-flow/core/rules.drift.test.ts',
      'apps/web/src/features/release-flow/ReleaseFlowPage.tsx',
      'apps/web/src/routes/release-flow.tsx',
    ]);

    for (const file of result.files) {
      const written = readFileSync(join(sandbox, file.path), 'utf8');
      expect(written).not.toMatch(/__[A-Z_]+__/);
      const diagnostics = parses(file.path, written).filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      );
      expect(diagnostics, `${file.path} should parse without syntax errors`).toEqual([]);
    }

    // rules.ts = transition-table-as-data with exhaustive Records.
    const rules = contentsOf(result.files, 'core/rules.ts');
    expect(rules).toContain('export const guards: Readonly<Record<GuardId, GuardPredicate>>');
    expect(rules).toContain('export const transitionTable: Readonly<Record<Phase, readonly GuardId[]>>');
    expect(rules).toContain('export const canApplyReleaseFlowMove');
    // machine.ts = the derivation generator with the as-free carrier + fail-loud.
    const machineFile = contentsOf(result.files, 'core/machine.ts');
    expect(machineFile).toContain('const eventCarrier: MachineEvent = moveEventByPhase.draft');
    expect(machineFile).toContain('export const evaluateReleaseFlowMove');
    expect(machineFile).toContain('throw new Error(`machine produced no verdict');
    // drift test = property test incl. the WIP=1 edge.
    const drift = contentsOf(result.files, 'core/rules.drift.test.ts');
    expect(drift).toContain('evaluateReleaseFlowMove');
    expect(drift).toContain('canApplyReleaseFlowMove');
    expect(drift).toContain('WIP=1');
    // The drift-proof ships an EXECUTABLE planted mutant (not a comment): a
    // hand-written machine that drops a guard, asserted to be caught by `disagree`.
    expect(drift).toContain('driftedMachine');
    expect(drift).toContain('planted');
    expect(drift).not.toContain('EXTENSION POINT');
    // index.ts carries the oracle-guard usage comment and re-exports the oracle.
    const index = contentsOf(result.files, 'core/index.ts');
    expect(index).toContain('ORACLE-GUARD USAGE');
    expect(index).toContain('evaluateReleaseFlowMove');

    expect(result.checklist).toContain('RUNG 3');
    expect(result.checklist).toContain('drift');
  });

  it('defaults to rung 1 (no machine) when --machine is omitted', () => {
    const withoutFlag = generateIsland({
      name: 'plain-board',
      outDir: sandbox,
      repoRoot: sandbox,
      dryRun: true,
    });
    const explicitNone = generateIsland({
      name: 'plain-board',
      outDir: sandbox,
      repoRoot: sandbox,
      machine: 'none',
      dryRun: true,
    });
    const paths = withoutFlag.files.map((file) => file.path);
    expect(paths).toEqual(explicitNone.files.map((file) => file.path));
    expect(paths).not.toContain('apps/web/src/features/plain-board/core/store.ts');
    expect(paths).not.toContain('apps/web/src/features/plain-board/core/rules.ts');
    expect(withoutFlag.checklist).toContain('RESOLVED (ADR-0005)');
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
