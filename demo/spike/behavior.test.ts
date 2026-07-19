import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  type ColumnId,
  type CoreApi,
  type CoreFactory,
  type Gateway,
  type GatewayResult,
} from './core-contract';
import { variants } from './registry';

const flush = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

interface GatewayCall {
  readonly op: 'addCard' | 'moveCard' | 'removeCard';
  readonly input: unknown;
}

interface FakeGateway {
  readonly gateway: Gateway;
  readonly log: GatewayCall[];
  readonly pendingCount: () => number;
  readonly settleNext: (result: GatewayResult) => Promise<void>;
}

const createFakeGateway = (): FakeGateway => {
  const log: GatewayCall[] = [];
  const pending: Array<(result: GatewayResult) => void> = [];
  const call = (op: GatewayCall['op']) => (input: unknown): Promise<GatewayResult> => {
    log.push({ op, input });
    return new Promise((resolve) => {
      pending.push(resolve);
    });
  };
  return {
    gateway: {
      addCard: call('addCard'),
      moveCard: call('moveCard'),
      removeCard: call('removeCard'),
    },
    log,
    pendingCount: () => pending.length,
    settleNext: async (result) => {
      const resolve = pending.shift();
      if (resolve === undefined) throw new Error('no pending gateway call to settle');
      resolve(result);
      await flush();
    },
  };
};

interface Harness {
  readonly core: CoreApi;
  readonly fake: FakeGateway;
}

const createHarness = (createCore: CoreFactory): Harness => {
  const fake = createFakeGateway();
  let counter = 0;
  const core = createCore({
    gateway: fake.gateway,
    generateId: () => {
      counter += 1;
      return `card-${counter}`;
    },
  });
  return { core, fake };
};

const titles = (core: CoreApi, column: ColumnId): readonly string[] =>
  core.selectors.cardsIn(column).map((card) => card.title);

const addCommitted = async (
  harness: Harness,
  title: string,
  column: ColumnId,
): Promise<string> => {
  harness.core.send({ type: 'cardAdded', title, column });
  await harness.fake.settleNext({ ok: true });
  const card = harness.core
    .getState()
    .cards.find((candidate) => candidate.title === title && candidate.column === column);
  if (card === undefined) throw new Error(`card "${title}" did not commit`);
  return card.id;
};

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });

describe('spike scaffolding', () => {
  it('keeps every spike source file free of react imports', () => {
    const spikeDir = dirname(fileURLToPath(import.meta.url));
    const files = listSourceFiles(spikeDir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/\bfrom\s+['"]react(-dom)?(\/[^'"]*)?['"]/);
      expect(source, file).not.toMatch(/\b(?:require|import)\(\s*['"]react(-dom)?(\/[^'"]*)?['"]/);
    }
  });

  it.runIf(variants.length === 0)(
    'awaits variant factories — register them in spike/registry.ts',
    () => {
      expect(variants).toEqual([]);
    },
  );
});

describe.each(variants)('island core: $name', ({ createCore }) => {
  it('lists the four columns in order', () => {
    const { core } = createHarness(createCore);
    expect(core.selectors.listColumns()).toEqual([...COLUMNS]);
  });

  it('starts empty with nothing to undo', () => {
    const { core } = createHarness(createCore);
    expect(core.getState().cards).toEqual([]);
    expect(core.selectors.canUndo()).toBe(false);
  });

  it('applies cardAdded optimistically and sends the injected id to the gateway', () => {
    const { core, fake } = createHarness(createCore);
    core.send({ type: 'cardAdded', title: 'Buy milk', column: 'todo' });
    expect(titles(core, 'todo')).toEqual(['Buy milk']);
    expect(fake.log).toEqual([
      { op: 'addCard', input: { id: 'card-1', title: 'Buy milk', column: 'todo', index: 0 } },
    ]);
    expect(core.selectors.canUndo()).toBe(false);
  });

  it('keeps the card and enables undo once the gateway confirms', async () => {
    const { core, fake } = createHarness(createCore);
    core.send({ type: 'cardAdded', title: 'Buy milk', column: 'todo' });
    await fake.settleNext({ ok: true });
    expect(titles(core, 'todo')).toEqual(['Buy milk']);
    expect(core.selectors.canUndo()).toBe(true);
  });

  it('rolls back a failed cardAdded to the exact prior state', async () => {
    const harness = createHarness(createCore);
    await addCommitted(harness, 'Existing', 'in-dev');
    const before = structuredClone(harness.core.getState());
    harness.core.send({ type: 'cardAdded', title: 'Doomed', column: 'todo' });
    expect(titles(harness.core, 'todo')).toEqual(['Doomed']);
    await harness.fake.settleNext({ ok: false, error: 'boom' });
    expect(harness.core.getState()).toEqual(before);
  });

  it('applies cardMoved optimistically and commits on success', async () => {
    const harness = createHarness(createCore);
    const aId = await addCommitted(harness, 'A', 'todo');
    await addCommitted(harness, 'B', 'todo');
    harness.core.send({ type: 'cardMoved', cardId: aId, toColumn: 'review', toIndex: 0 });
    expect(titles(harness.core, 'todo')).toEqual(['B']);
    expect(titles(harness.core, 'review')).toEqual(['A']);
    expect(harness.fake.log.at(-1)).toEqual({
      op: 'moveCard',
      input: { cardId: aId, toColumn: 'review', toIndex: 0 },
    });
    await harness.fake.settleNext({ ok: true });
    expect(titles(harness.core, 'review')).toEqual(['A']);
  });

  it('restores the exact order when a cardMoved fails', async () => {
    const harness = createHarness(createCore);
    await addCommitted(harness, 'A', 'todo');
    await addCommitted(harness, 'B', 'todo');
    const cId = await addCommitted(harness, 'C', 'todo');
    const before = structuredClone(harness.core.getState());
    harness.core.send({ type: 'cardMoved', cardId: cId, toColumn: 'todo', toIndex: 0 });
    expect(titles(harness.core, 'todo')).toEqual(['C', 'A', 'B']);
    await harness.fake.settleNext({ ok: false, error: 'boom' });
    expect(harness.core.getState()).toEqual(before);
    expect(titles(harness.core, 'todo')).toEqual(['A', 'B', 'C']);
  });

  it('applies cardRemoved optimistically and restores position on failure', async () => {
    const harness = createHarness(createCore);
    await addCommitted(harness, 'A', 'todo');
    const bId = await addCommitted(harness, 'B', 'todo');
    await addCommitted(harness, 'C', 'todo');
    const before = structuredClone(harness.core.getState());
    harness.core.send({ type: 'cardRemoved', cardId: bId });
    expect(titles(harness.core, 'todo')).toEqual(['A', 'C']);
    await harness.fake.settleNext({ ok: false, error: 'boom' });
    expect(harness.core.getState()).toEqual(before);
    expect(titles(harness.core, 'todo')).toEqual(['A', 'B', 'C']);
  });

  it('undoes a committed add by removing the card through the gateway', async () => {
    const harness = createHarness(createCore);
    const id = await addCommitted(harness, 'A', 'todo');
    harness.core.send({ type: 'undoRequested' });
    expect(titles(harness.core, 'todo')).toEqual([]);
    expect(harness.fake.log.at(-1)).toEqual({ op: 'removeCard', input: { cardId: id } });
    await harness.fake.settleNext({ ok: true });
    expect(harness.core.selectors.canUndo()).toBe(false);
  });

  it('undoes a committed move back to the prior column and index', async () => {
    const harness = createHarness(createCore);
    await addCommitted(harness, 'A', 'todo');
    const bId = await addCommitted(harness, 'B', 'todo');
    harness.core.send({ type: 'cardMoved', cardId: bId, toColumn: 'in-dev', toIndex: 0 });
    await harness.fake.settleNext({ ok: true });
    harness.core.send({ type: 'undoRequested' });
    expect(titles(harness.core, 'in-dev')).toEqual([]);
    expect(titles(harness.core, 'todo')).toEqual(['A', 'B']);
    expect(harness.fake.log.at(-1)).toEqual({
      op: 'moveCard',
      input: { cardId: bId, toColumn: 'todo', toIndex: 1 },
    });
    await harness.fake.settleNext({ ok: true });
    expect(harness.core.selectors.canUndo()).toBe(false);
  });

  it('undoes a committed remove by re-adding the card at its prior index', async () => {
    const harness = createHarness(createCore);
    await addCommitted(harness, 'A', 'todo');
    const bId = await addCommitted(harness, 'B', 'todo');
    await addCommitted(harness, 'C', 'todo');
    harness.core.send({ type: 'cardRemoved', cardId: bId });
    await harness.fake.settleNext({ ok: true });
    harness.core.send({ type: 'undoRequested' });
    expect(titles(harness.core, 'todo')).toEqual(['A', 'B', 'C']);
    expect(harness.fake.log.at(-1)).toEqual({
      op: 'addCard',
      input: { id: bId, title: 'B', column: 'todo', index: 1 },
    });
    await harness.fake.settleNext({ ok: true });
    expect(harness.core.selectors.canUndo()).toBe(false);
  });

  it('keeps the previous undo target when a later op fails', async () => {
    const harness = createHarness(createCore);
    const id = await addCommitted(harness, 'A', 'todo');
    harness.core.send({ type: 'cardMoved', cardId: id, toColumn: 'done', toIndex: 0 });
    await harness.fake.settleNext({ ok: false, error: 'boom' });
    expect(harness.core.selectors.canUndo()).toBe(true);
    harness.core.send({ type: 'undoRequested' });
    expect(harness.fake.log.at(-1)).toEqual({ op: 'removeCard', input: { cardId: id } });
  });

  it('ignores undoRequested when nothing is undoable', () => {
    const { core, fake } = createHarness(createCore);
    const before = structuredClone(core.getState());
    core.send({ type: 'undoRequested' });
    expect(core.getState()).toEqual(before);
    expect(fake.log).toEqual([]);
    expect(fake.pendingCount()).toBe(0);
  });

  it('ignores mutations that reference an unknown card', () => {
    const { core, fake } = createHarness(createCore);
    core.send({ type: 'cardMoved', cardId: 'ghost', toColumn: 'done', toIndex: 0 });
    core.send({ type: 'cardRemoved', cardId: 'ghost' });
    expect(core.getState().cards).toEqual([]);
    expect(fake.log).toEqual([]);
  });

  it('notifies subscribers on state change and stops after unsubscribe', async () => {
    const harness = createHarness(createCore);
    let notified = 0;
    const unsubscribe = harness.core.subscribe(() => {
      notified += 1;
    });
    harness.core.send({ type: 'cardAdded', title: 'A', column: 'todo' });
    expect(notified).toBeGreaterThanOrEqual(1);
    await harness.fake.settleNext({ ok: true });
    unsubscribe();
    const seen = notified;
    harness.core.send({ type: 'cardAdded', title: 'B', column: 'todo' });
    await harness.fake.settleNext({ ok: true });
    expect(notified).toBe(seen);
  });

  it('returns plain serializable state snapshots', () => {
    const { core } = createHarness(createCore);
    core.send({ type: 'cardAdded', title: 'A', column: 'todo' });
    const state = core.getState();
    expect(structuredClone(state)).toEqual(state);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
