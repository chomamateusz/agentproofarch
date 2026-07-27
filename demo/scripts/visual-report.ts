import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { z } from 'zod';

/**
 * The visual review gallery (ADR-0013): it turns the `visual-diff` artifact into
 * one sticky pull-request comment showing expected · actual · diff inline.
 *
 * It runs in the `visual-report` job, which checks out the trusted base commit
 * and never the pull-request head, so everything reaching this script from the
 * pull request is data:
 *   - artifact file names are untrusted (a spec title becomes a path), so only
 *     `<name>-{expected,actual,diff}.png` entries are copied, flattened, with no
 *     directory component carried over;
 *   - the images are published to the unprotected `visual-reports` branch under
 *     `pr-<number>/run-<id>/`. The run id is in the path because
 *     raw.githubusercontent.com caches by URL: a fixed path would serve the
 *     previous run's image for minutes, and a new URL cannot be stale;
 *   - the branch is rewritten as a single orphan root commit holding the
 *     directories of currently open pull requests only, so it stays bounded and
 *     a closed pull request's images leave with the next publication.
 */

const marker = '<!-- visual-review-gallery -->';
const reportBranch = 'visual-reports';
const allowedName = /^([A-Za-z0-9._-]+)-(expected|actual|diff)\.png$/;
const pageSize = 100;

const envSchema = z.object({
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_REPOSITORY: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  PR_NUMBER: z.coerce.number().int().positive(),
  RUN_ID: z.coerce.number().int().positive(),
  VISUAL_OUTCOME: z.enum(['success', 'failure']),
  VISUAL_ARTIFACT_DIR: z.string().min(1),
});

const commentSchema = z.object({
  id: z.number().int().positive(),
  body: z.string().nullable(),
  user: z.object({ type: z.string() }),
});

const pullSchema = z.object({ number: z.number().int().positive() });

type Kind = 'expected' | 'actual' | 'diff';

const kinds = ['expected', 'actual', 'diff'] as const;

interface Screenshot {
  readonly stem: string;
  readonly files: Record<Kind, string>;
  readonly pixels: string;
}

const env = envSchema.parse(process.env);
const demoRoot = join(import.meta.dirname, '..');
const runUrl = `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.RUN_ID}`;

const api = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${init?.method ?? 'GET'} ${path} returned ${response.status}.`);
  }
  if (response.status === 204) return null;
  return response.json();
};

const paginate = async <T>(
  path: string,
  query: Record<string, string>,
  itemSchema: z.ZodType<T>,
): Promise<T[]> => {
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    const search = new URLSearchParams({ ...query, per_page: String(pageSize), page: String(page) });
    const batch = z.array(itemSchema).parse(await api(`${path}?${search.toString()}`));
    items.push(...batch);
    if (batch.length < pageSize) return items;
  }
};

const collectFiles = (root: string): Map<string, string> => {
  const files = new Map<string, string>();
  if (!existsSync(root)) return files;
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile() && allowedName.test(entry.name)) {
        const name = basename(entry.name);
        if (files.has(name)) throw new Error(`Duplicate flattened artifact name: ${name}`);
        files.set(name, full);
      }
    }
  };
  visit(root);
  return files;
};

const pixelSummary = (expected: string, actual: string): string => {
  const result = spawnSync(
    process.execPath,
    [join(demoRoot, 'scripts/visual-diff.mjs'), expected, actual],
    { encoding: 'utf8' },
  );
  return result.stdout.trim() || 'pixel count unavailable';
};

const screenshotsFrom = (files: Map<string, string>): Screenshot[] => {
  const grouped = new Map<string, Partial<Record<Kind, string>>>();
  for (const [name, path] of files) {
    const match = allowedName.exec(name);
    const stem = match?.[1];
    const kind = kinds.find((candidate) => candidate === match?.[2]);
    if (stem === undefined || kind === undefined) continue;
    grouped.set(stem, { ...grouped.get(stem), [kind]: path });
  }

  const screenshots: Screenshot[] = [];
  for (const [stem, group] of grouped) {
    if (!group.expected || !group.actual || !group.diff) continue;
    screenshots.push({
      stem,
      files: { expected: group.expected, actual: group.actual, diff: group.diff },
      pixels: pixelSummary(group.expected, group.actual),
    });
  }
  return screenshots.sort((left, right) => left.stem.localeCompare(right.stem));
};

const git = (
  cwd: string,
  args: string[],
  options: { readonly allowFailure?: boolean; readonly env?: NodeJS.ProcessEnv } = {},
): boolean => {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });
  if (result.status === 0) return true;
  if (options.allowFailure) return false;
  throw new Error(result.stderr.trim() || `git ${args[0] ?? ''} failed.`);
};

const publish = async (screenshots: Screenshot[]): Promise<void> => {
  const worktree = mkdtempSync(join(tmpdir(), 'visual-reports-'));
  // The token travels in the environment, never into the repository config on
  // disk, so it cannot outlive this process.
  const auth = Buffer.from(`x-access-token:${env.GITHUB_TOKEN}`).toString('base64');
  const gitEnv = {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}`,
  };

  try {
    git(worktree, ['init']);
    git(worktree, ['remote', 'add', 'origin', `https://github.com/${env.GITHUB_REPOSITORY}.git`]);
    const branchExists = git(
      worktree,
      ['fetch', '--depth=1', 'origin', `refs/heads/${reportBranch}`],
      { allowFailure: true, env: gitEnv },
    );
    if (!branchExists && screenshots.length === 0) return;
    git(
      worktree,
      branchExists
        ? ['checkout', '--orphan', 'publication', 'FETCH_HEAD']
        : ['checkout', '--orphan', 'publication'],
    );

    const open = new Set(
      (await paginate(`/repos/${env.GITHUB_REPOSITORY}/pulls`, { state: 'open' }, pullSchema)).map(
        (pull) => pull.number,
      ),
    );
    for (const entry of readdirSync(worktree, { withFileTypes: true })) {
      const number = Number(/^pr-(\d+)$/.exec(entry.name)?.[1]);
      if (!entry.isDirectory() || Number.isNaN(number)) continue;
      if (!open.has(number) || number === env.PR_NUMBER) {
        rmSync(join(worktree, entry.name), { recursive: true, force: true });
      }
    }

    if (screenshots.length > 0) {
      const destination = join(worktree, `pr-${env.PR_NUMBER}`, `run-${env.RUN_ID}`);
      mkdirSync(destination, { recursive: true });
      for (const screenshot of screenshots) {
        for (const kind of kinds) {
          copyFileSync(screenshot.files[kind], join(destination, `${screenshot.stem}-${kind}.png`));
        }
      }
    }

    git(worktree, ['config', 'user.name', 'github-actions[bot]']);
    git(worktree, ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
    git(worktree, ['add', '-A']);
    git(worktree, ['commit', '--allow-empty', '-m', `Visual reports for run ${env.RUN_ID}`]);
    git(worktree, ['push', '--force', 'origin', `HEAD:refs/heads/${reportBranch}`], {
      env: gitEnv,
    });
  } finally {
    rmSync(worktree, { recursive: true, force: true });
  }
};

const imageUrl = (stem: string, kind: Kind): string =>
  `https://raw.githubusercontent.com/${env.GITHUB_REPOSITORY}/${reportBranch}/` +
  `pr-${env.PR_NUMBER}/run-${env.RUN_ID}/${encodeURIComponent(`${stem}-${kind}.png`)}`;

const galleryBody = (screenshots: Screenshot[]): string => {
  if (screenshots.length === 0) {
    return env.VISUAL_OUTCOME === 'success'
      ? `${marker}\n## Visual review\n\nNo visual changes. [Workflow run](${runUrl}).`
      : `${marker}\n## Visual review\n\nThe comparison produced no complete expected/actual/diff ` +
          `set to show — a screenshot with no baseline yet, or a run that died before writing one. ` +
          `[Read the run and its artifacts](${runUrl}#artifacts).`;
  }

  const rows = screenshots
    .map(
      (screenshot) =>
        `<tr><td><code>${screenshot.stem}</code><br>${screenshot.pixels}</td>` +
        kinds
          .map(
            (kind) =>
              `<td><img width="260" alt="${screenshot.stem} ${kind}" ` +
              `src="${imageUrl(screenshot.stem, kind)}"></td>`,
          )
          .join('') +
        `</tr>`,
    )
    .join('\n');

  return (
    `${marker}\n## Visual review\n\n` +
    `<table><thead><tr><th>Screenshot</th><th>Expected</th><th>Actual</th><th>Diff</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>\n\n` +
    `[Open the run's \`playwright-report\` artifact](${runUrl}#artifacts) for the side-by-side and ` +
    `slider views.\n\n` +
    `If this is the change you made, the repository owner — or a login listed in the ` +
    `\`VISUAL_APPROVERS\` repository variable — comments \`/approve-visuals\` to re-render the ` +
    `baselines and commit them onto this branch.`
  );
};

const upsertComment = async (body: string, createWhenMissing: boolean): Promise<void> => {
  const comments = await paginate(
    `/repos/${env.GITHUB_REPOSITORY}/issues/${env.PR_NUMBER}/comments`,
    {},
    commentSchema,
  );
  const existing = comments.find(
    (comment) => comment.user.type === 'Bot' && comment.body?.includes(marker),
  );
  if (existing) {
    await api(`/repos/${env.GITHUB_REPOSITORY}/issues/comments/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
    return;
  }
  if (!createWhenMissing) return;
  await api(`/repos/${env.GITHUB_REPOSITORY}/issues/${env.PR_NUMBER}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
};

const screenshots = screenshotsFrom(collectFiles(env.VISUAL_ARTIFACT_DIR));
await publish(screenshots);
// A clean run never opens a gallery comment; it only corrects one that a red run
// left behind.
await upsertComment(
  galleryBody(screenshots),
  screenshots.length > 0 || env.VISUAL_OUTCOME === 'failure',
);
