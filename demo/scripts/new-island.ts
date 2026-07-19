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
 * RUNG 1 ONLY. The generated core is a thin re-export of server-state
 * descriptors with a typed, stubbed `send`; the client MACHINE (rung 2 = island
 * store, rung 3 = statechart) is deliberately absent — its templates land after
 * the machine spike (zustand/vanilla vs @xstate/store) decides the store. Every
 * generated file carries a marked `<<EXTENSION POINT>>` where the machine wires
 * in. Like new-resource, it does NOT edit shared files: the generated code
 * imports symbols that do not exist yet (a bound descriptor, a registered
 * route), so `npm run check` stays RED until every checklist step is wired — the
 * type system, not the generator, enforces completion.
 */

/** Existing feature folders an island name must not clobber. */
const RESERVED_ISLANDS = new Set(['todos', 'auth']);

interface IslandTemplate {
  readonly templateFile: string;
  readonly path: (names: ResourceNames) => string;
}

const ISLAND_TEMPLATES: readonly IslandTemplate[] = [
  {
    templateFile: 'island-events.ts.tpl',
    path: (n) => `apps/web/src/features/${n.singularKebab}/core/events.ts`,
  },
  {
    templateFile: 'island-selectors.ts.tpl',
    path: (n) => `apps/web/src/features/${n.singularKebab}/core/selectors.ts`,
  },
  {
    templateFile: 'island-index.ts.tpl',
    path: (n) => `apps/web/src/features/${n.singularKebab}/core/index.ts`,
  },
  {
    templateFile: 'island-core.test.ts.tpl',
    path: (n) => `apps/web/src/features/${n.singularKebab}/core/${n.singularKebab}.test.ts`,
  },
  {
    templateFile: 'island-page.tsx.tpl',
    path: (n) => `apps/web/src/features/${n.singularKebab}/${n.singularPascal}Page.tsx`,
  },
  {
    templateFile: 'island-route.tsx.tpl',
    path: (n) => `apps/web/src/routes/${n.singularKebab}.tsx`,
  },
];

const planIslandFiles = (names: ResourceNames): GeneratedFile[] =>
  ISLAND_TEMPLATES.map((template) => ({
    path: template.path(names),
    contents: renderTemplateFile(template.templateFile, names),
  }));

export interface GenerateIslandOptions {
  name: string;
  /** Base directory the generated files are written into. */
  outDir: string;
  /** Directory checked for collisions with an existing island of this name. */
  repoRoot: string;
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

  if (RESERVED_ISLANDS.has(names.singularKebab)) {
    throw new ResourceNameError(`Island "${names.singularKebab}" is reserved or already exists.`);
  }

  const files = planIslandFiles(names);

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

  return { names, files, checklist: buildChecklist(names, files) };
};

const buildChecklist = (names: ResourceNames, files: GeneratedFile[]): string => {
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

const runCli = (): void => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const name = args.find((arg) => !arg.startsWith('--'));
  if (name === undefined) {
    process.stderr.write('Usage: npm run new:island -- <name> [--dry-run]\n');
    process.exit(1);
  }
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const result = generateIsland({ name, outDir: repoRoot, repoRoot, dryRun });
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
