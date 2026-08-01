import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import {
  baselineChangesFrom,
  baselineSection,
  pullFileSchema,
  type BaselineChange,
} from './visual-baseline-changes.js';
import {
  collectFiles,
  kinds,
  publishedName,
  screenshotsFrom,
  type Kind,
  type Screenshot,
} from './visual-screenshots.js';

/**
 * The visual review gallery (ADR-0013): it turns the `visual-diff` artifact into
 * one sticky pull-request comment showing baseline · actual · diff inline
 * (Playwright's "expected" renamed for readers — artifact names keep its
 * vocabulary, published names and the column header say baseline), plus the
 * before/after of the baselines the pull request re-renders and commits
 * (`visual-baseline-changes.ts`) — that case is green by construction and
 * therefore invisible in the mismatch table.
 *
 * It runs in the `visual-report` job, which checks out the trusted base commit
 * and never the pull-request head, so everything reaching this script from the
 * pull request is data:
 *   - artifact file names are untrusted (a spec title becomes a path), so only
 *     `<name>-{expected,actual,diff}.png` entries are copied, flattened, with no
 *     directory component carried over, and published as
 *     `<name>-{baseline,actual,diff}.png`;
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
const pageSize = 100;

const envSchema = z.object({
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_REPOSITORY: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  PR_NUMBER: z.coerce.number().int().positive(),
  RUN_ID: z.coerce.number().int().positive(),
  VISUAL_OUTCOME: z.enum(['success', 'failure']),
  VISUAL_ARTIFACT_DIR: z.string().min(1),
  BASE_SHA: z.string().regex(/^[0-9a-f]{40}$/),
  HEAD_SHA: z.string().regex(/^[0-9a-f]{40}$/),
  AI_VERDICTS: z.string().optional(),
});

const commentSchema = z.object({
  id: z.number().int().positive(),
  body: z.string().nullable(),
  user: z.object({ type: z.string() }),
});

const pullSchema = z.object({ number: z.number().int().positive() });

const verdictSchema = z.object({
  verdicts: z.array(z.object({ screenshot: z.string(), line: z.string() })),
});

const env = envSchema.parse(process.env);
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
          copyFileSync(
            screenshot.files[kind],
            join(destination, `${screenshot.stem}-${publishedName(kind)}.png`),
          );
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
  `pr-${env.PR_NUMBER}/run-${env.RUN_ID}/${encodeURIComponent(`${stem}-${publishedName(kind)}.png`)}`;

// The verdict is advisory and fail-open (ADR-0013 polish): a missing token, a
// model error or malformed output degrades to the unavailable note — the
// gallery itself never depends on it, so it cannot become a gate by accident.
const aiReadSection = (screenshots: Screenshot[]): string => {
  const note =
    `_Advisory only — the AI read can never gate this job; ` +
    `the gallery posts with or without it._`;
  const parsed = ((): Map<string, string> | undefined => {
    if (env.AI_VERDICTS === undefined || env.AI_VERDICTS === '') return undefined;
    const raw = ((): unknown => {
      try {
        return JSON.parse(env.AI_VERDICTS ?? '');
      } catch {
        return undefined;
      }
    })();
    const result = verdictSchema.safeParse(raw);
    if (!result.success) return undefined;
    return new Map(
      result.data.verdicts.map((verdict) => [
        verdict.screenshot,
        verdict.line.replace(/\s+/g, ' ').trim().slice(0, 200),
      ]),
    );
  })();
  if (parsed === undefined) {
    return `### AI read\n\nVerdict unavailable this run. ${note}`;
  }
  const lines = screenshots.map(
    (screenshot) =>
      `- \`${screenshot.stem}\` — ` +
      (parsed.get(screenshot.stem) ?? 'uwaga — brak werdyktu dla tego zrzutu'),
  );
  return `### AI read\n\n${lines.join('\n')}\n\n${note}`;
};

const mismatchSection = (screenshots: Screenshot[]): string => {
  const rows = screenshots
    .map(
      (screenshot) =>
        `<tr><td><code>${screenshot.stem}</code><br>${screenshot.pixels}</td>` +
        kinds
          .map(
            (kind) =>
              `<td><img width="260" alt="${screenshot.stem} ${publishedName(kind)}" ` +
              `src="${imageUrl(screenshot.stem, kind)}"></td>`,
          )
          .join('') +
        `</tr>`,
    )
    .join('\n');

  return (
    `### Pixel mismatches against the committed baselines\n\n` +
    `<table><thead><tr><th>Screenshot</th><th>Baseline</th><th>Actual</th><th>Diff</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>\n\n` +
    `${aiReadSection(screenshots)}\n\n` +
    `[Open the run's \`playwright-report\` artifact](${runUrl}#artifacts) for the side-by-side and ` +
    `slider views.\n\n` +
    `If this is the change you made, the repository owner — or a login listed in the ` +
    `\`VISUAL_APPROVERS\` repository variable — comments \`/approve-visuals\` to re-render the ` +
    `baselines and commit them onto this branch.`
  );
};

const galleryBody = (screenshots: Screenshot[], changes: BaselineChange[]): string => {
  const sections: string[] = [];
  if (screenshots.length > 0) {
    sections.push(mismatchSection(screenshots));
  } else if (env.VISUAL_OUTCOME === 'failure') {
    sections.push(
      `The comparison produced no complete baseline/actual/diff set to show — a screenshot with ` +
        `no baseline yet, or a run that died before writing one. ` +
        `[Read the run and its artifacts](${runUrl}#artifacts).`,
    );
  }
  if (changes.length > 0) {
    sections.push(
      baselineSection(changes, {
        repository: env.GITHUB_REPOSITORY,
        baseSha: env.BASE_SHA,
        headSha: env.HEAD_SHA,
      }),
    );
  }
  if (sections.length === 0) {
    return `${marker}\n## Visual review\n\nNo visual changes. [Workflow run](${runUrl}).`;
  }
  return `${marker}\n## Visual review\n\n${sections.join('\n\n')}`;
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
const baselineChanges = baselineChangesFrom(
  await paginate(
    `/repos/${env.GITHUB_REPOSITORY}/pulls/${env.PR_NUMBER}/files`,
    {},
    pullFileSchema,
  ),
);
await publish(screenshots);
// A clean run with nothing to show never opens a gallery comment; it only
// corrects one that a red run left behind.
await upsertComment(
  galleryBody(screenshots, baselineChanges),
  screenshots.length > 0 || baselineChanges.length > 0 || env.VISUAL_OUTCOME === 'failure',
);
