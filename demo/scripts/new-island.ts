import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveNames, renderTemplateFile, ResourceNameError } from './new-resource.js';
import type { GeneratedFile, ResourceNames } from './new-resource.js';

/**
 * Island scaffolder — the client-state sibling of new-resource. It generates a
 * feature (island) core: the events-in / selectors-out seam a view talks to,
 * plus the view, its route and a colocated core test. It reuses new-resource's
 * name derivation, render + token machinery, dry-run and collision refusal.
 *
 * The `--machine` flag picks the rung (the owner's post-spike decision):
 *   none        RUNG 1 — a thin re-export of server-state descriptors with a
 *               typed, stubbed `send`; no client machine.
 *   store       RUNG 2 — additionally an @xstate/store island store (core/store.ts;
 *               the owner's first choice, its event map IS the seam), wired into
 *               the seam's send/selectors, with a store test.
 *   statechart  RUNG 3 — additionally the transition-table-as-data (core/rules.ts),
 *               the DERIVED XState oracle (core/machine.ts, hand-writing forbidden),
 *               and a drift property test (core/rules.drift.test.ts). The oracle is
 *               consulted by a UI machine in a guard (see core/index.ts).
 *
 * Every mode carries marked `<<EXTENSION POINT>>`s where the seam grows. Like
 * new-resource, it does NOT edit shared files: the generated code imports symbols
 * that do not exist yet (a bound descriptor, a gateway, a registered route), so
 * `npm run check` stays RED until every checklist step is wired — the type system,
 * not the generator, enforces completion.
 */

/** The client-state machine each mode wires behind the island seam. */
export type MachineMode = 'none' | 'store' | 'statechart';

const MACHINE_MODES: readonly MachineMode[] = ['none', 'store', 'statechart'];

const isMachineMode = (value: string): value is MachineMode =>
  MACHINE_MODES.some((mode) => mode === value);

/** Existing feature folders an island name must not clobber. */
const RESERVED_ISLANDS = new Set(['todos', 'auth']);

const eventsTemplate = (machine: MachineMode): string =>
  machine === 'store' ? 'island-events.store.ts.tpl' : 'island-events.ts.tpl';

const indexTemplate = (machine: MachineMode): string => {
  if (machine === 'store') return 'island-index.store.ts.tpl';
  if (machine === 'statechart') return 'island-index.statechart.ts.tpl';
  return 'island-index.ts.tpl';
};

const coreTestTemplate = (machine: MachineMode): string =>
  machine === 'store' ? 'island-core.store.test.ts.tpl' : 'island-core.test.ts.tpl';

const planIslandFiles = (names: ResourceNames, machine: MachineMode): GeneratedFile[] => {
  const feature = `apps/web/src/features/${names.singularKebab}`;
  const file = (templateFile: string, path: string): GeneratedFile => ({
    path,
    contents: renderTemplateFile(templateFile, names),
  });

  const files: GeneratedFile[] = [
    file(eventsTemplate(machine), `${feature}/core/events.ts`),
    file('island-selectors.ts.tpl', `${feature}/core/selectors.ts`),
  ];

  if (machine === 'store') {
    files.push(file('island-store.ts.tpl', `${feature}/core/store.ts`));
  }
  if (machine === 'statechart') {
    files.push(file('island-rules.ts.tpl', `${feature}/core/rules.ts`));
    files.push(file('island-machine.ts.tpl', `${feature}/core/machine.ts`));
  }

  files.push(file(indexTemplate(machine), `${feature}/core/index.ts`));
  files.push(file(coreTestTemplate(machine), `${feature}/core/${names.singularKebab}.test.ts`));

  if (machine === 'statechart') {
    files.push(file('island-rules.drift.test.ts.tpl', `${feature}/core/rules.drift.test.ts`));
  }

  files.push(file('island-page.tsx.tpl', `${feature}/${names.singularPascal}Page.tsx`));
  files.push(file('island-route.tsx.tpl', `apps/web/src/routes/${names.singularKebab}.tsx`));

  return files;
};

export interface GenerateIslandOptions {
  name: string;
  /** Base directory the generated files are written into. */
  outDir: string;
  /** Directory checked for collisions with an existing island of this name. */
  repoRoot: string;
  /** Client-state machine to scaffold behind the seam. Defaults to 'none' (rung 1). */
  machine?: MachineMode;
  /** When true, plan and return files without writing them. */
  dryRun?: boolean;
}

export interface GenerateIslandResult {
  names: ResourceNames;
  files: GeneratedFile[];
  checklist: string;
}

export const generateIsland = (options: GenerateIslandOptions): GenerateIslandResult => {
  const names = deriveNames(options.name);
  const machine = options.machine ?? 'none';

  if (RESERVED_ISLANDS.has(names.singularKebab)) {
    throw new ResourceNameError(`Island "${names.singularKebab}" is reserved or already exists.`);
  }

  const files = planIslandFiles(names, machine);

  for (const file of files) {
    if (existsSync(join(options.repoRoot, file.path))) {
      throw new ResourceNameError(
        `Refusing to overwrite existing file: ${file.path}. Pick a different name.`,
      );
    }
  }

  if (!options.dryRun) {
    for (const file of files) {
      const target = join(options.outDir, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.contents);
    }
  }

  return { names, files, checklist: buildChecklist(names, files, machine) };
};

const buildChecklist = (
  names: ResourceNames,
  files: GeneratedFile[],
  machine: MachineMode,
): string => {
  if (machine !== 'none') return buildMachineChecklist(names, files, machine);
  const n = names;
  const generated = files.map((file) => `  + ${file.path}`).join('\n');
  return `
Scaffolded island "${n.singularKebab}" (feature = island). Generated files (owned
by this island):
${generated}

These GENERATED files import symbols that do not exist yet — a bound descriptor
and a registered route — so \`npm run check\` will stay RED until every step below
is wired. The island core is RUNG 1: server-state descriptors behind the seam
and a stubbed \`send\`; the client machine is deliberately absent (see the machine
note at the end). Work top to bottom:

1. READ DESCRIPTOR — bind the island's server-state read.
   The view reads through \`${n.singularCamel}Selectors.list\`, which re-exports
   \`actions.${n.singularCamel}\` from apps/web/src/api.ts. Either point
   core/selectors.ts at an EXISTING resource query (e.g. \`list: actions.todos\`),
   or scaffold a new resource (\`npm run new:resource -- <name>\`), wire its
   checklist, and bind it here:
   apps/web/src/api.ts
     1a. anchor:  todosQuery,        (the '#core/client/index.js' import)
         add:     ${n.singularCamel}Query,
     1b. anchor:  todos: todosQuery(apiClient),   (the actions object)
         add:     ${n.singularCamel}: ${n.singularCamel}Query(apiClient),
   Then reconcile the key in core/selectors.ts if you aliased a different action.

2. WEB ROUTE — apps/web/src/main.tsx
   (The route component — apps/web/src/routes/${n.singularKebab}.tsx — is already
    generated.)
   2a. anchor:  import { TodosRoute } from './routes/todos.js';
       add:     import { ${n.singularPascal}Route } from './routes/${n.singularKebab}.js';
   2b. anchor:  const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, loginRoute]) });
       add a route above it and register it:
         const ${n.singularCamel}Route = createRoute({
           getParentRoute: () => rootRoute,
           path: '/${n.singularKebab}',
           component: ${n.singularPascal}Route,
         });
       then extend addChildren([indexRoute, loginRoute, ${n.singularCamel}Route]).

3. CORE TEST — apps/web/src/features/${n.singularKebab}/core/${n.singularKebab}.test.ts
   is generated with a passing rung-1 assertion and TODO homes for the machine's
   unit tests. Write the core's tests before growing the view.

MACHINE (rung 2 / rung 3) — DECISION-PENDING THE SPIKE.
   This island ships at RUNG 1 (no client store). Do NOT add zustand/@xstate/store
   here yet: the store choice (zustand/vanilla vs @xstate/store) and the
   isomorphic-rules strategy are being settled by the machine spike. When it
   lands, graduate at the marked <<EXTENSION POINT>>s in core/index.ts and
   core/selectors.ts — rung 2 = island store, rung 3 = statechart (XState) — and
   the view keeps talking to the same send/selectors seam. See
   docs/architecture.md §Client application state (ADR-0005).

Verify (write core tests before wiring the UI):
  npm run check && npm run smoke
`;
};

/** Shared shared-file wiring steps (identical for store and statechart). */
const sharedWiringSteps = (n: ResourceNames): string => `
1. READ DESCRIPTOR — bind the island's server-state read.
   The view reads through \`${n.singularCamel}Selectors.list\`, which re-exports
   \`actions.${n.singularCamel}\` from apps/web/src/api.ts. Point core/selectors.ts
   at an EXISTING resource query (e.g. \`list: actions.todos\`), or scaffold a new
   resource (\`npm run new:resource -- <name>\`), wire its checklist, and bind it:
   apps/web/src/api.ts
     1a. anchor:  todosQuery,        (the '#core/client/index.js' import)
         add:     ${n.singularCamel}Query,
     1b. anchor:  todos: todosQuery(apiClient),   (the actions object)
         add:     ${n.singularCamel}: ${n.singularCamel}Query(apiClient),

2. WEB ROUTE — apps/web/src/main.tsx
   (The route component — apps/web/src/routes/${n.singularKebab}.tsx — is already
    generated.)
   2a. anchor:  import { TodosRoute } from './routes/todos.js';
       add:     import { ${n.singularPascal}Route } from './routes/${n.singularKebab}.js';
   2b. anchor:  const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, loginRoute]) });
       add a route above it and register it:
         const ${n.singularCamel}Route = createRoute({
           getParentRoute: () => rootRoute,
           path: '/${n.singularKebab}',
           component: ${n.singularPascal}Route,
         });
       then extend addChildren([indexRoute, loginRoute, ${n.singularCamel}Route]).`;

const buildMachineChecklist = (
  names: ResourceNames,
  files: GeneratedFile[],
  machine: 'store' | 'statechart',
): string => {
  const n = names;
  const generated = files.map((file) => `  + ${file.path}`).join('\n');
  const rung = machine === 'store' ? '2 (island store)' : '3 (statechart)';

  const storeSection = `
3. GATEWAY — apps/web/src/api.ts
   The store (core/store.ts) is OPTIMISTIC: it applies each edit locally, then
   persists it through an injected gateway (${n.singularPascal}Gateway). core/index.ts
   imports \`${n.singularCamel}Gateway\` from apps/web/src/api.ts — it does not exist
   yet, so \`npm run check\` stays RED until you bind one.
   anchor:  todos: todosQuery(apiClient),   (near the actions object)
   add a gateway that maps each method to a core/client mutation:
     export const ${n.singularCamel}Gateway: ${n.singularPascal}Gateway = {
       addItem: (input) => apiClient.add${n.singularPascal}Item(input).then(toResult),
       moveItem: (input) => apiClient.move${n.singularPascal}Item(input).then(toResult),
       removeItem: (input) => apiClient.remove${n.singularPascal}Item(input).then(toResult),
     };
   (Import ${n.singularPascal}Gateway from the island core; scaffold the mutations
    via \`npm run new:resource\` and wire them through core/client.)

4. STORE TEST — apps/web/src/features/${n.singularKebab}/core/${n.singularKebab}.test.ts
   is generated with the rung-2 store tests (optimistic apply + undo, driven by a
   fake gateway) and an <<EXTENSION POINT>> for the rollback test. The store block
   is green immediately; the seam assertions go green once steps 1 and 3 are wired.

RUNG 2 — @xstate/store (the owner's first choice; its event map IS the seam).
   core/store.ts is the machine behind the seam; core/index.ts forwards \`send\`
   to it and exposes its client selectors alongside the server read. The view's
   calls never change. See docs/architecture.md §Client application state (ADR-0005).`;

  const statechartSection = `
3. CORE TEST — apps/web/src/features/${n.singularKebab}/core/${n.singularKebab}.test.ts
   holds the rung-1 seam assertions; grow them into your UI-machine tests. The
   domain oracle is proven separately by the drift test (below).

RUNG 3 — transition-table-as-data + a DERIVED oracle.
   core/rules.ts is the SINGLE SOURCE OF TRUTH (exhaustive Records; adding a phase
   or rule is a compile error until every site is covered). core/machine.ts DERIVES
   the XState oracle from that table programmatically — hand-writing the machine is
   forbidden. core/rules.drift.test.ts is a property test over every (state, event)
   pair (incl. the WIP=1 edge) and runs in CI: it fails the moment the derived
   machine and the table disagree.
   COMPOSE, don't embed: this island's own hand-written UI machine CONSULTS the
   oracle (\`evaluate${n.singularPascal}Move\`) in a guard — see the oracle-guard note
   in core/index.ts. UI states never enter the domain machine. The server derives
   its check from the SAME table. See docs/architecture.md §Client application state
   (ADR-0005).`;

  return `
Scaffolded island "${n.singularKebab}" (feature = island, RUNG ${rung}). Generated
files (owned by this island):
${generated}

These GENERATED files import symbols that do not exist yet — a bound descriptor${
    machine === 'store' ? ', a gateway' : ''
  }
and a registered route — so \`npm run check\` will stay RED until every step below
is wired. Work top to bottom:
${sharedWiringSteps(n)}
${machine === 'store' ? storeSection : statechartSection}

Verify (write core tests before wiring the UI):
  npm run check && npm run smoke
`;
};

const parseMachine = (args: readonly string[]): MachineMode => {
  const flag = args.find((arg) => arg.startsWith('--machine='));
  if (flag === undefined) return 'none';
  const value = flag.slice('--machine='.length);
  if (!isMachineMode(value)) {
    throw new ResourceNameError(
      `Invalid --machine=${value}: expected one of ${MACHINE_MODES.join(', ')}.`,
    );
  }
  return value;
};

const runCli = (): void => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const name = args.find((arg) => !arg.startsWith('--'));
  if (name === undefined) {
    process.stderr.write(
      'Usage: npm run new:island -- <name> [--machine=store|statechart] [--dry-run]\n',
    );
    process.exit(1);
  }
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const machine = parseMachine(args);
    const result = generateIsland({ name, outDir: repoRoot, repoRoot, machine, dryRun });
    process.stdout.write(result.checklist);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`new:island failed: ${message}\n`);
    process.exit(1);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
