import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

import { z } from 'zod';

import { observabilityEnvSchema, serverEnvSchema } from '#core/server/config.js';

import { lintLinks } from './link-lint.js';
import { lintMigrations } from './migration-lint.js';

/**
 * Doc-lint: keeps docs and enforcer configuration honest in both directions
 * (ADR-0004 §Decision 4). It is deliberately a plain script, not a framework.
 *
 *   docs -> config: every enforcer the docs promise must still exist in
 *     eslint.config.js / .dependency-cruiser.cjs.
 *   config -> docs: every custom rule in eslint-plugin-agentproofarch/rules
 *     must be documented by name.
 *   counts:         hand-maintained numeric claims in the READMEs and on the
 *     published website are replaced with `<!--count:NAME-->N<!--/count-->`
 *     tokens verified against the real sources here, so a stale number fails
 *     the gate instead of misleading. Docusaurus pages compile as MDX, which
 *     rejects HTML comments, so they use the MDX comment spelling instead
 *     (see COUNT_TOKEN_SYNTAXES). REQUIRED_COUNT_TOKENS pins which surface
 *     must carry which counter, so a rewrite cannot drop a checked number
 *     back to unverifiable prose.
 *   versions:       the pages that quote the *current* release identity wrap it
 *     in a `release-version` region (same two comment spellings as the counts),
 *     checked against `demo/package.json`; VERSION_PINNED_FILES additionally
 *     forbids an unwrapped version claim on those pages, so a release bump fails
 *     `check` until the docs follow instead of relying on review to notice.
 *   env schema:     every key the config schema reads is documented in
 *     `.env.example`.
 *   links:          every link in a tracked `.md` resolves to a file — relative
 *     links against the linking file, site-absolute ones against the Docusaurus
 *     static directory (see link-lint.ts).
 *   delimiters:     no tool/XML delimiter leaks into committed prose.
 */

const demoRoot = join(import.meta.dirname, '..');
const repoRoot = join(demoRoot, '..');
const docsRoot = join(demoRoot, '..', 'docs');
const require = createRequire(import.meta.url);

/**
 * Tool/XML delimiters that must never survive into committed prose (round-1
 * audit C1: `</content>`/`</invoke>` leaked into the tails of several READMEs).
 */
const LEAKED_DELIMITERS = ['</content>', '</invoke>'];

const eslintConfigPath = join(demoRoot, 'eslint.config.js');
const depcruiseConfigPath = join(demoRoot, '.dependency-cruiser.cjs');
const rulesDir = join(demoRoot, 'eslint-plugin-agentproofarch', 'rules');

type ConfigTarget = 'eslint' | 'depcruise';

interface Enforcer {
  readonly id: string;
  readonly config: ConfigTarget;
  readonly doc: string;
}

/**
 * Enforcers the prose promises but does not spell as a literal rule id. Extend
 * this when the docs make a new enforcement promise; remove an entry only when
 * the docs stop promising it.
 */
const DOC_PROMISED_ENFORCERS: readonly Enforcer[] = [
  { id: 'boundaries/element-types', config: 'eslint', doc: 'architecture.md §Principles' },
  { id: '@typescript-eslint/no-explicit-any', config: 'eslint', doc: 'architecture.md §Layers' },
  { id: 'no-restricted-syntax', config: 'eslint', doc: 'architecture.md §Layers' },
  { id: 'boundaries/external', config: 'eslint', doc: 'frontend-lint-plan.md §Phase 2' },
  { id: 'vercel-and-neon-only-in-adapters', config: 'depcruise', doc: 'architecture.md §Layers' },
  { id: 'no-frameworks-in-core', config: 'depcruise', doc: 'architecture.md §Layers' },
  { id: 'core-domain-depends-on-nothing', config: 'depcruise', doc: 'architecture.md §Layers' },
  { id: 'web-features-are-islands', config: 'depcruise', doc: 'architecture.md §Frontend' },
  {
    id: 'web-layouts-are-structure-only',
    config: 'depcruise',
    doc: 'architecture.md §Frontend',
  },
];

interface DocFile {
  readonly rel: string;
  readonly text: string;
}

const collectDocs = (dir: string): DocFile[] => {
  const docs: DocFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      docs.push(...collectDocs(full));
    } else if (entry.name.endsWith('.md')) {
      docs.push({ rel: relative(repoRoot, full), text: readFileSync(full, 'utf8') });
    }
  }
  return docs;
};

const backtickTokens = (text: string): string[] => {
  const tokens: string[] = [];
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    const token = match[1];
    if (token !== undefined) tokens.push(token);
  }
  return tokens;
};

/** Root/demo READMEs and CLAUDE files count as documentation surfaces too (F6). */
const extraSurfaceRels = ['README.md', 'demo/README.md', 'CLAUDE.md', 'demo/CLAUDE.md'];
const extraSurfaces: DocFile[] = extraSurfaceRels
  .filter((rel) => existsSync(join(repoRoot, rel)))
  .map((rel) => ({ rel, text: readFileSync(join(repoRoot, rel), 'utf8') }));

const proseSurfaces = [...collectDocs(docsRoot), ...extraSurfaces];
const proseCombined = proseSurfaces.map((doc) => doc.text).join('\n');

const eslintSource = readFileSync(eslintConfigPath, 'utf8');
const depcruiseModule: { forbidden: ReadonlyArray<{ name: string }> } = require(depcruiseConfigPath);
const depcruiseRuleNames = new Set(depcruiseModule.forbidden.map((rule) => rule.name));

const configHasId = (id: string, target: ConfigTarget): boolean =>
  target === 'eslint' ? eslintSource.includes(id) : depcruiseRuleNames.has(id);

const configFileFor = (target: ConfigTarget): string =>
  target === 'eslint' ? 'eslint.config.js' : '.dependency-cruiser.cjs';

const problems: string[] = [];

const trackedMarkdown = execFileSync('git', ['ls-files', '-z', '*.md'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\0')
  .filter((entry) => entry.length > 0);

// ── Leaked-delimiter check: every git-tracked `.md`. ────────────────────────
for (const rel of trackedMarkdown) {
  const text = readFileSync(join(repoRoot, rel), 'utf8');
  for (const delimiter of LEAKED_DELIMITERS) {
    if (text.includes(delimiter)) {
      problems.push(`[delimiter] "${delimiter}" leaked into ${rel} — delete the stray tool/XML tag.`);
    }
  }
}

// ── docs -> config: backticked custom-plugin rule ids spelt literally. ──────
const CUSTOM_RULE_ID = /^agentproofarch\/[a-z][a-z0-9-]*$/;
for (const doc of proseSurfaces) {
  for (const token of backtickTokens(doc.text)) {
    if (!CUSTOM_RULE_ID.test(token)) continue;
    if (!eslintSource.includes(token)) {
      problems.push(
        `[docs->config] "${token}" (${doc.rel}) is promised but absent from eslint.config.js — ` +
          `restore the rule or stop naming it.`,
      );
    }
  }
}

// ── docs -> config: the explicit manifest of prose-promised enforcers. ──────
for (const enforcer of DOC_PROMISED_ENFORCERS) {
  if (!configHasId(enforcer.id, enforcer.config)) {
    problems.push(
      `[docs->config] "${enforcer.id}" (${enforcer.doc}) is absent from ` +
        `${configFileFor(enforcer.config)} — restore it or stop promising it.`,
    );
  }
}

// ── config -> docs: every custom rule file documented by name somewhere. ────
const ruleFiles = readdirSync(rulesDir).filter(
  (name) => name.endsWith('.js') && !name.endsWith('.test.js'),
);
for (const file of ruleFiles) {
  const ruleName = basename(file, '.js');
  if (!proseCombined.includes(ruleName)) {
    problems.push(
      `[config->docs] rule "${ruleName}" (eslint-plugin-agentproofarch/rules/${file}) is ` +
        `undocumented — name it in the docs or the READMEs, or remove the rule.`,
    );
  }
}

// ── Injected counts: verify `<!--count:NAME-->N<!--/count-->` against source. ─
// Files, not individual it()/test() calls, are the stable unit for the total
// (scaffolder tests embed literal `it(` inside template strings, so a call-level
// count would over-report); the small, dynamic-free suites (e2e/integration/
// config-regression) are counted by declaration because their dirs hold no
// generated tests. Counting reads the working tree — exactly what vitest runs.
const TEST_DECL = /^[ \t]*(it|test)(\.(skip|only|todo|fails|fixme|concurrent|each))?\(/gm;

const walkTestFiles = (dir: string): string[] => {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkTestFiles(full));
    } else if (/\.test\.(ts|tsx|js)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
};

const filesIn = (rel: string, suffix: string): string[] => {
  const dir = join(demoRoot, rel);
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(suffix))
        .map((name) => join(dir, name))
    : [];
};

const countDecls = (files: readonly string[]): number =>
  files.reduce((total, file) => total + (readFileSync(file, 'utf8').match(TEST_DECL)?.length ?? 0), 0);

const defaultRunTestFiles = (): string[] =>
  ['core', 'adapters', 'apps', 'scripts', 'config-regression', 'eslint-plugin-agentproofarch']
    .flatMap((root) => (existsSync(join(demoRoot, root)) ? walkTestFiles(join(demoRoot, root)) : []))
    .filter((file) => !file.endsWith('.integration.test.ts'));

const e2eSpecFiles = (): string[] => filesIn('e2e', '.spec.ts');
const integrationFiles = (): string[] =>
  ['adapters', 'apps']
    .flatMap((root) => (existsSync(join(demoRoot, root)) ? walkTestFiles(join(demoRoot, root)) : []))
    .filter((file) => file.endsWith('.integration.test.ts'));
const configRegressionFiles = (): string[] => filesIn('config-regression', '.test.ts');

const COUNTERS: Record<string, () => number> = {
  'test-files': () => defaultRunTestFiles().length,
  'e2e-specs': () => e2eSpecFiles().length,
  'e2e-tests': () => countDecls(e2eSpecFiles()),
  'integration-tests': () => countDecls(integrationFiles()),
  'config-regression': () => countDecls(configRegressionFiles()),
};

/**
 * Two spellings of the same token. Markdown read as markdown takes the HTML
 * comment; `website/**` is compiled as MDX by Docusaurus, which rejects HTML
 * comments outright ("Unexpected character `!`"), so those pages carry the MDX
 * comment form. Both are invisible in the rendered page.
 */
const COUNT_TOKEN_SYNTAXES: readonly RegExp[] = [
  /<!--count:([a-z0-9-]+)-->(\d+)<!--\/count-->/g,
  /\{\/\*count:([a-z0-9-]+)\*\/\}(\d+)\{\/\*\/count\*\/\}/g,
];

/**
 * The surfaces whose numeric claims must stay machine-checked, and the counters
 * each one is required to carry. Verifying only the tokens that happen to be
 * present cannot catch a number that was never tokenised — which is exactly how
 * the published website drifted to stale test counts while `check` stayed green.
 * Extend an entry when a page starts making a new numeric claim; shrink one only
 * when the page genuinely stops making that claim.
 */
const ALL_COUNTERS = ['test-files', 'integration-tests', 'e2e-tests', 'e2e-specs', 'config-regression'];
const REQUIRED_COUNT_TOKENS: Readonly<Record<string, readonly string[]>> = {
  'demo/README.md': ALL_COUNTERS,
  'website/docs/guides/testing-doctrine.md': ALL_COUNTERS,
  'website/docs/start/landing.md': ALL_COUNTERS,
};

const FROZEN_DOC_ROOTS = ['website/versioned_docs/'];
const isFrozenDoc = (rel: string): boolean =>
  FROZEN_DOC_ROOTS.some((root) => rel.startsWith(root));

let countTokensSeen = 0;
const countersByFile = new Map<string, Set<string>>();
for (const rel of trackedMarkdown) {
  // A cut snapshot is frozen by design; its numbers describe that release, not the working tree.
  if (isFrozenDoc(rel)) continue;
  const text = readFileSync(join(repoRoot, rel), 'utf8');
  const seenHere = new Set<string>();
  countersByFile.set(rel, seenHere);
  for (const syntax of COUNT_TOKEN_SYNTAXES) {
    for (const match of text.matchAll(syntax)) {
      countTokensSeen += 1;
      const name = match[1] ?? '';
      const claimed = Number(match[2]);
      const counter = COUNTERS[name];
      if (!counter) {
        problems.push(`[count] unknown counter "${name}" in ${rel} — valid: ${Object.keys(COUNTERS).join(', ')}.`);
        continue;
      }
      seenHere.add(name);
      const actual = counter();
      if (actual !== claimed) {
        problems.push(
          `[count] ${rel}: count:${name} claims ${claimed} but the source has ${actual} — ` +
            `update the token to ${actual}.`,
        );
      }
    }
  }
}

for (const [rel, required] of Object.entries(REQUIRED_COUNT_TOKENS)) {
  const seenHere = countersByFile.get(rel);
  if (!seenHere) {
    problems.push(
      `[count] ${rel} is listed in REQUIRED_COUNT_TOKENS but is not a tracked .md file — ` +
        `commit it, or drop the entry if the page is gone.`,
    );
    continue;
  }
  for (const name of required) {
    if (!seenHere.has(name)) {
      problems.push(
        `[count] ${rel} must state count:${name} as a verified token but does not — ` +
          `restore the token around the number instead of writing it as prose.`,
      );
    }
  }
}

// ── Release version: guarded regions must quote demo/package.json's version. ─
const appVersion = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(join(demoRoot, 'package.json'), 'utf8'))).version;

const VERSION_REGION_SYNTAXES: readonly RegExp[] = [
  /<!--release-version-->([\s\S]*?)<!--\/release-version-->/g,
  /\{\/\*release-version\*\/\}([\s\S]*?)\{\/\*\/release-version\*\/\}/g,
];

/** The two shapes a release-identity claim takes in the samples: the manifest field and the `vX.Y.Z` stamp. */
const VERSION_CLAIM = /"version":\s*"(\d+\.\d+\.\d+)"|\bv(\d+\.\d+\.\d+)\b/g;

/**
 * Pages whose version claims describe the release being cut, not history. On
 * these, every claim must sit inside a region — a new unwrapped sample is the
 * drift the token would otherwise miss. Pages that discuss past cuts (ADR-0014,
 * versioning-and-releases, the changelog) are deliberately absent: their `v1.0.0`
 * is a fact about that release and must not be rewritten by a later bump.
 */
const VERSION_PINNED_FILES: readonly string[] = [
  'website/docs/start/quickstart.md',
  'website/docs/operations/health-and-attestation.md',
  'website/docs/guides/cli-reference.md',
  'website/docs/guides/cli-walkthrough.md',
];

const versionClaimsIn = (text: string): string[] => {
  const claims: string[] = [];
  for (const match of text.matchAll(VERSION_CLAIM)) {
    const claimed = match[1] ?? match[2];
    if (claimed !== undefined) claims.push(claimed);
  }
  return claims;
};

const withoutVersionRegions = (text: string): string =>
  VERSION_REGION_SYNTAXES.reduce((stripped, syntax) => stripped.replace(syntax, ''), text);

const pinnedVersionFiles = new Set(VERSION_PINNED_FILES);
let versionClaimsSeen = 0;
const versionRegionsByFile = new Map<string, number>();
const unguardedVersionsByFile = new Map<string, string[]>();
for (const rel of trackedMarkdown) {
  if (isFrozenDoc(rel)) continue;
  const text = readFileSync(join(repoRoot, rel), 'utf8');
  let regions = 0;
  for (const syntax of VERSION_REGION_SYNTAXES) {
    for (const match of text.matchAll(syntax)) {
      regions += 1;
      const claims = versionClaimsIn(match[1] ?? '');
      if (claims.length === 0) {
        problems.push(
          `[version] ${rel}: a release-version region guards no version string — ` +
            `wrap the sample that states the version, or drop the region.`,
        );
        continue;
      }
      versionClaimsSeen += claims.length;
      for (const claimed of claims) {
        if (claimed !== appVersion) {
          problems.push(
            `[version] ${rel}: release-version region claims ${claimed} but demo/package.json ` +
              `is ${appVersion} — update the page to ${appVersion}.`,
          );
        }
      }
    }
  }
  versionRegionsByFile.set(rel, regions);
  if (pinnedVersionFiles.has(rel)) {
    unguardedVersionsByFile.set(rel, versionClaimsIn(withoutVersionRegions(text)));
  }
}

for (const rel of VERSION_PINNED_FILES) {
  const regions = versionRegionsByFile.get(rel);
  if (regions === undefined) {
    problems.push(
      `[version] ${rel} is listed in VERSION_PINNED_FILES but is not a tracked .md file — ` +
        `commit it, or drop the entry if the page is gone.`,
    );
    continue;
  }
  if (regions === 0) {
    problems.push(
      `[version] ${rel} must state the release version inside a release-version region but ` +
        `carries none — restore the region, or drop the entry if the page stopped quoting it.`,
    );
  }
  for (const claimed of unguardedVersionsByFile.get(rel) ?? []) {
    problems.push(
      `[version] ${rel}: "${claimed}" states a release version outside a release-version ` +
        `region — wrap it so the gate checks it.`,
    );
  }
}

// ── env schema ⊆ .env.example: every key the config schema reads is documented. ─
const envExample = readFileSync(join(demoRoot, '.env.example'), 'utf8');
const declaredEnvKeys = new Set([
  ...Object.keys(serverEnvSchema.shape),
  ...Object.keys(observabilityEnvSchema.shape),
]);
for (const key of declaredEnvKeys) {
  if (!new RegExp(`^#?\\s*${key}=`, 'm').test(envExample)) {
    problems.push(
      `[env] "${key}" is read by the config schema but not documented in .env.example — ` +
        `add it (commented if platform-injected).`,
    );
  }
}

// ── Dead-link check: every tracked `.md`. ──────────────────────────────────
/**
 * Build-generated docs are legitimate link targets that are absent from a clean
 * checkout, so `existsSync` is the wrong question for them. Each entry must be
 * produced by a `prebuild`/`prestart` hook and gitignored — never a file a human
 * is expected to create — so a genuine typo still fails.
 */
const GENERATED_DOCS = new Set([resolve(repoRoot, 'website/docs/changelog.md')]);
problems.push(
  ...lintLinks({
    repoRoot,
    files: trackedMarkdown,
    site: { docsPrefix: 'website/', staticDir: join('website', 'static') },
    generated: GENERATED_DOCS,
  }),
);

// ── Migration sequence: gapless, duplicate-free prefixes matching the journal. ─
const migrationProblems = lintMigrations(join(demoRoot, 'drizzle'));
problems.push(...migrationProblems);

if (problems.length > 0) {
  process.stderr.write(`doc-lint: ${problems.length} issue(s)\n\n`);
  for (const problem of problems) process.stderr.write(`  ${problem}\n`);
  process.exit(1);
}

const summary =
  `doc-lint: OK — ${DOC_PROMISED_ENFORCERS.length} promised enforcer(s) present, ` +
  `${ruleFiles.length} custom rule(s) documented, ${countTokensSeen} count token(s) verified, ` +
  `${versionClaimsSeen} release-version claim(s) at ${appVersion}, ` +
  `${declaredEnvKeys.size} env key(s) in .env.example, ` +
  `${trackedMarkdown.length} tracked .md file(s) clean of dead links and leaked delimiters, ` +
  `migration sequence + journal consistent.`;
process.stdout.write(`${summary}\n`);
