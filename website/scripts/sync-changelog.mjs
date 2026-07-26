import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// The canonical changelog is the repository root file; Docusaurus cannot import
// markdown from outside the site directory, so the docs page is generated from it
// (and gitignored) instead of being a second copy that can drift.
const websiteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(websiteDir, '..', 'CHANGELOG.md');
const target = resolve(websiteDir, 'docs', 'changelog.md');

const frontmatter = [
  '---',
  'title: Changelog',
  'sidebar_label: Changelog',
  'description: Every notable change, backfilled from merged pull-request history.',
  '---',
  '',
].join('\n');

writeFileSync(target, `${frontmatter}\n${readFileSync(source, 'utf8')}`);
