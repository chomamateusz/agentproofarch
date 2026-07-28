import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { lintLinks, type SitePaths } from './link-lint.js';

/**
 * Behavioral probe for the dead-link half of the doc-lint gate: plant a repo
 * whose links are deliberately broken and prove `lintLinks` still REJECTS them,
 * so a widened resolver cannot quietly stop catching typos. Every fixture lives
 * in its own temp dir.
 */

const site: SitePaths = { docsPrefix: 'website/', staticDir: join('website', 'static') };

let base: string;

const plant = (name: string, files: Record<string, string>): string => {
  const root = join(base, name);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
};

const lint = (repoRoot: string, files: readonly string[], generated = new Set<string>()): string[] =>
  lintLinks({ repoRoot, files, site, generated });

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'link-lint-probe-'));
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('dead-link gate still rejects violations', () => {
  it('accepts a relative link that resolves against the linking file', () => {
    const root = plant('relative-ok', {
      'docs/a.md': '[b](./b.md) and [up](../README.md#anchor)\n',
      'docs/b.md': '',
      'README.md': '',
    });
    expect(lint(root, ['docs/a.md'])).toEqual([]);
  });

  it('rejects a relative link to a missing file', () => {
    const root = plant('relative-missing', { 'docs/a.md': '[gone](./gone.md)\n' });
    const problems = lint(root, ['docs/a.md']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('relative link "./gone.md" points at a missing file');
  });

  it('resolves a site-absolute link against the static dir at any page depth', () => {
    const root = plant('absolute-ok', {
      'website/docs/start/landing.md': '![banner](/img/banner.png)\n',
      'website/versioned_docs/version-1.x/start/landing.md': '![banner](/img/banner.png)\n',
      'website/static/img/banner.png': 'png',
    });
    expect(
      lint(root, ['website/docs/start/landing.md', 'website/versioned_docs/version-1.x/start/landing.md']),
    ).toEqual([]);
  });

  it('rejects a site-absolute link with no file under the static dir', () => {
    const root = plant('absolute-missing', {
      'website/docs/start/landing.md': '![banner](/img/nope.png)\n',
      'website/static/img/banner.png': 'png',
    });
    const problems = lint(root, ['website/docs/start/landing.md']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('site-absolute link "/img/nope.png" points at a missing file');
  });

  it('rejects a site-absolute link written outside the Docusaurus site', () => {
    const root = plant('absolute-outside', {
      'README.md': '![banner](/img/banner.png)\n',
      'website/static/img/banner.png': 'png',
    });
    const problems = lint(root, ['README.md']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('resolves against the filesystem root');
  });

  it('ignores off-tree targets and anything inside code', () => {
    const root = plant('off-tree', {
      'docs/a.md': [
        '[http](https://example.com/gone.md) [mail](mailto:a@b.c) [tel](tel:+48123)',
        '[scheme-relative](//example.com/gone.png) [anchor](#section)',
        '`[inline](./gone.md)`',
        '```md\n[fenced](./gone.md)\n```',
        '',
      ].join('\n'),
    });
    expect(lint(root, ['docs/a.md'])).toEqual([]);
  });

  it('accepts a build-generated target that is absent from a clean checkout', () => {
    const root = plant('generated', { 'docs/a.md': '[changelog](./changelog.md)\n' });
    const generated = new Set([join(root, 'docs', 'changelog.md')]);
    expect(lint(root, ['docs/a.md'], generated)).toEqual([]);
    expect(lint(root, ['docs/a.md'])).toHaveLength(1);
  });
});
