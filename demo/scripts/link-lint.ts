import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Dead-link enforcement for tracked markdown (ADR-0004 §Decision 4). Two link
 * dialects have to resolve, because two renderers read the same files:
 *
 *   relative (`../x.md`)        resolved against the linking file, the way
 *     GitHub and every plain markdown reader resolve it.
 *   site-absolute (`/img/x.png`) resolved against the Docusaurus static
 *     directory, the way the published site resolves it. A versioned snapshot
 *     sits at a different depth than the live page it was cut from, so one
 *     relative spelling cannot be correct in both — the site-absolute form is,
 *     and Docusaurus' own `onBrokenLinks: throw` proves it at build time.
 *
 * Outside the site a leading `/` means the filesystem root to every reader, so
 * it stays an error there instead of silently resolving to a static asset. Pure
 * and path-parameterised so the unit test can plant a broken tree and prove the
 * gate still fires.
 */

export interface SitePaths {
  readonly docsPrefix: string;
  readonly staticDir: string;
}

export interface LinkLintInput {
  readonly repoRoot: string;
  readonly files: readonly string[];
  readonly site: SitePaths;
  readonly generated: ReadonlySet<string>;
}

const LINK = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const OFF_TREE = /^(https?:|mailto:|tel:|\/\/|#)/;

export const lintLinks = ({ repoRoot, files, site, generated }: LinkLintInput): string[] => {
  const problems: string[] = [];

  for (const rel of files) {
    const raw = readFileSync(join(repoRoot, rel), 'utf8');
    const prose = raw.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
    for (const match of prose.matchAll(LINK)) {
      const target = match[1] ?? '';
      if (OFF_TREE.test(target)) continue;
      const path = target.split('#')[0];
      if (!path) continue;

      if (path.startsWith('/')) {
        if (!rel.startsWith(site.docsPrefix)) {
          problems.push(
            `[link] ${rel}: site-absolute link "${target}" resolves against the filesystem root ` +
              `outside ${site.docsPrefix} — use a relative path.`,
          );
          continue;
        }
        if (!existsSync(join(repoRoot, site.staticDir, path))) {
          problems.push(
            `[link] ${rel}: site-absolute link "${target}" points at a missing file under ` +
              `${site.staticDir}.`,
          );
        }
        continue;
      }

      const resolved = resolve(dirname(join(repoRoot, rel)), path);
      if (generated.has(resolved)) continue;
      if (!existsSync(resolved)) {
        problems.push(`[link] ${rel}: relative link "${target}" points at a missing file.`);
      }
    }
  }

  return problems;
};
