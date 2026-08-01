import { describe, expect, it } from 'vitest';

import {
  baselineChangesFrom,
  baselineSection,
  type BaselineCommits,
  type PullFile,
} from './visual-baseline-changes.js';

/**
 * The gallery's before/after pairs are built from pull-request-authored file
 * names and rendered into a comment the maintainer trusts: this probe pins both
 * the classification (which side of the pair exists) and the refusal of any
 * path that is not a committed baseline.
 */

const commits: BaselineCommits = {
  repository: 'owner/repo',
  baseSha: 'a'.repeat(40),
  headSha: 'b'.repeat(40),
};

const file = (filename: string, status: string, previous?: string): PullFile => ({
  filename,
  status,
  ...(previous === undefined ? {} : { previous_filename: previous }),
});

const baseline = (name: string): string => `demo/visual/__screenshots__/linux/chromium/${name}`;

describe('deliberate baseline changes', () => {
  it('pairs a modified baseline with both commits', () => {
    expect(baselineChangesFrom([file(baseline('login.png'), 'modified')])).toEqual([
      {
        name: 'linux/chromium/login.png',
        before: baseline('login.png'),
        after: baseline('login.png'),
      },
    ]);
  });

  it('gives an added baseline no before side and a removed one no after side', () => {
    expect(
      baselineChangesFrom([file(baseline('new.png'), 'added'), file(baseline('old.png'), 'removed')]),
    ).toEqual([
      { name: 'linux/chromium/new.png', before: undefined, after: baseline('new.png') },
      { name: 'linux/chromium/old.png', before: baseline('old.png'), after: undefined },
    ]);
  });

  it('reads a rename from its previous path at the base commit', () => {
    expect(
      baselineChangesFrom([file(baseline('after.png'), 'renamed', baseline('before.png'))]),
    ).toEqual([
      {
        name: 'linux/chromium/after.png',
        before: baseline('before.png'),
        after: baseline('after.png'),
      },
    ]);
  });

  it('ignores files outside the baseline root, traversal and non-PNG entries', () => {
    expect(
      baselineChangesFrom([
        file('demo/apps/web/src/main.tsx', 'modified'),
        file('demo/visual/surfaces.spec.ts', 'modified'),
        file('demo/visual/__screenshots__/../../../etc/passwd.png', 'modified'),
        file('demo/visual/__screenshots__/linux/chromium/login.png ', 'modified'),
      ]),
    ).toEqual([]);
  });

  it('sorts by the displayed name', () => {
    const names = baselineChangesFrom([
      file(baseline('register.png'), 'modified'),
      file(baseline('boot-splash.png'), 'modified'),
    ]).map((change) => change.name);
    expect(names).toEqual(['linux/chromium/boot-splash.png', 'linux/chromium/register.png']);
  });

  it('renders the before image at the base sha and the after image at the head sha', () => {
    const section = baselineSection(baselineChangesFrom([file(baseline('login.png'), 'modified')]), commits);
    expect(section).toContain('### Deliberate baseline changes in this PR');
    expect(section).toContain(
      `src="https://raw.githubusercontent.com/owner/repo/${commits.baseSha}/demo/visual/__screenshots__/linux/chromium/login.png"`,
    );
    expect(section).toContain(
      `src="https://raw.githubusercontent.com/owner/repo/${commits.headSha}/demo/visual/__screenshots__/linux/chromium/login.png"`,
    );
  });

  it('labels the missing side of an added and a removed baseline', () => {
    const section = baselineSection(
      baselineChangesFrom([file(baseline('new.png'), 'added'), file(baseline('old.png'), 'removed')]),
      commits,
    );
    expect(section).toContain('<em>new surface</em>');
    expect(section).toContain('<em>baseline removed</em>');
  });

  it('caps the table and says how many changes it left out', () => {
    const changes = baselineChangesFrom(
      Array.from({ length: 42 }, (_, index) => file(baseline(`surface-${index}.png`), 'modified')),
    );
    const section = baselineSection(changes, commits);
    expect(section).toContain('2 further baseline change(s) are not shown here');
    expect(section.match(/<tr><td><code>/g)).toHaveLength(40);
  });
});
