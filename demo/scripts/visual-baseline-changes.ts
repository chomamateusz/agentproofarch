import { z } from 'zod';

/**
 * The second half of the visual review gallery (ADR-0013): the baselines a pull
 * request deliberately re-renders and COMMITS. That change makes the pixel
 * comparison green by construction, so the mismatch gallery has nothing to show
 * — and GitHub collapses image diffs in Files changed — leaving the one change
 * where before/after matters most invisible. These helpers read the change out
 * of the pull request's file list and render it as raw.githubusercontent pairs
 * pinned to the base and head commits (immutable URLs, so no cache can serve a
 * stale pixel).
 *
 * The `visual-report` job checks out the trusted base commit and has no head
 * tree to diff against, so the file list comes from the pull-request API — and
 * those names are pull-request-authored input. Only paths under the baseline
 * root, in a conservative character set and carrying no `..` segment, reach a
 * URL or the comment body.
 */

export const pullFileSchema = z.object({
  filename: z.string(),
  status: z.string(),
  previous_filename: z.string().optional(),
});

export type PullFile = z.infer<typeof pullFileSchema>;

export interface BaselineChange {
  readonly name: string;
  readonly before: string | undefined;
  readonly after: string | undefined;
}

export interface BaselineCommits {
  readonly repository: string;
  readonly baseSha: string;
  readonly headSha: string;
}

const baselineRoot = 'demo/visual/__screenshots__/';
const baselinePath = /^demo\/visual\/__screenshots__\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.png$/;
const maxRows = 40;

const isBaseline = (path: string | undefined): path is string =>
  path !== undefined && baselinePath.test(path) && !path.split('/').includes('..');

export const baselineChangesFrom = (files: readonly PullFile[]): BaselineChange[] => {
  const changes: BaselineChange[] = [];
  for (const file of files) {
    const head = isBaseline(file.filename) ? file.filename : undefined;
    const previous = isBaseline(file.previous_filename) ? file.previous_filename : undefined;
    const before = ((): string | undefined => {
      if (file.status === 'added' || file.status === 'copied') return undefined;
      if (file.status === 'renamed') return previous;
      return head;
    })();
    const after = file.status === 'removed' ? undefined : head;
    const named = after ?? before;
    if (named === undefined) continue;
    changes.push({ name: named.slice(baselineRoot.length), before, after });
  }
  return changes.sort((left, right) => left.name.localeCompare(right.name));
};

const rawUrl = (commits: BaselineCommits, sha: string, path: string): string =>
  `https://raw.githubusercontent.com/${commits.repository}/${sha}/` +
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

export const baselineSection = (
  changes: readonly BaselineChange[],
  commits: BaselineCommits,
): string => {
  const shown = changes.slice(0, maxRows);
  const cell = (path: string | undefined, sha: string, absent: string, alt: string): string =>
    path === undefined
      ? `<td><em>${absent}</em></td>`
      : `<td><img width="260" alt="${alt}" src="${rawUrl(commits, sha, path)}"></td>`;

  const rows = shown
    .map(
      (change) =>
        `<tr><td><code>${change.name}</code></td>` +
        cell(change.before, commits.baseSha, 'new surface', `${change.name} before`) +
        cell(change.after, commits.headSha, 'baseline removed', `${change.name} after`) +
        `</tr>`,
    )
    .join('\n');

  const omitted = changes.length - shown.length;
  const overflow =
    omitted > 0
      ? `\n\n_${omitted} further baseline change(s) are not shown here — read them on the Files tab._`
      : '';

  return (
    `### Deliberate baseline changes in this PR\n\n` +
    `These baselines are re-rendered and committed on this branch, so the comparison above is ` +
    `clean by construction — and GitHub collapses image diffs in Files changed. This is that ` +
    `before/after, at the base and head commits.\n\n` +
    `<table><thead><tr><th>Baseline</th><th>Before (base)</th><th>After (head)</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>${overflow}`
  );
};
