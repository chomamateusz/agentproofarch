import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

import {
  needsSnapshot,
  nextVersion,
  snapshotName,
  withReleaseHeading,
  withVersion,
} from './release-plan.js';

const bumpSchema = z.enum(['major', 'minor', 'patch']);
const parsed = bumpSchema.safeParse(process.argv[2]);
if (!parsed.success) {
  process.stderr.write('usage: pnpm run release -- <major|minor|patch>\n');
  process.exit(2);
}

const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
if (status.length > 0) {
  process.stderr.write('release must be cut from a clean tree\n');
  process.exit(1);
}

const demoDir = resolve(import.meta.dirname, '..');
const repoDir = resolve(demoDir, '..');
const websiteDir = resolve(repoDir, 'website');
const manifestPath = resolve(demoDir, 'package.json');
const changelogPath = resolve(repoDir, 'CHANGELOG.md');
const manifestText = readFileSync(manifestPath, 'utf8');
const manifest = z.object({ version: z.string() }).parse(JSON.parse(manifestText));
const next = nextVersion(manifest.version, parsed.data);
writeFileSync(manifestPath, withVersion(manifestText, next));

const changelogText = readFileSync(changelogPath, 'utf8');
const isoDate = new Date().toISOString().slice(0, 10);
writeFileSync(changelogPath, withReleaseHeading(changelogText, next, isoDate));

if (needsSnapshot(parsed.data)) {
  try {
    execFileSync(
      'pnpm',
      ['--dir', websiteDir, 'exec', 'node', 'scripts/sync-changelog.mjs'],
      { stdio: 'inherit' },
    );
    execFileSync(
      'pnpm',
      ['--dir', websiteDir, 'run', 'docusaurus', 'docs:version', snapshotName(next)],
      { stdio: 'inherit' },
    );
  } catch (error) {
    process.stderr.write('run `pnpm install --frozen-lockfile` in website/ first\n');
    throw error;
  }
}

process.stdout.write(
  'review the diff; commit it on main; open the main → production release PR; ' +
    'let tag-release cut the tag after the owner merges\n',
);
