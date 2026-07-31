import { describe, expect, it } from 'vitest';

import {
  needsSnapshot,
  nextSteps,
  nextVersion,
  releaseBumpArgument,
  snapshotName,
  withReleaseHeading,
  withVersion,
} from './release-plan.js';

describe('release plan', () => {
  it('reads direct and pnpm-delimited bump arguments', () => {
    expect(releaseBumpArgument(['major'])).toBe('major');
    expect(releaseBumpArgument(['--', 'minor'])).toBe('minor');
    expect(releaseBumpArgument([])).toBeUndefined();
  });

  it('computes every SemVer bump', () => {
    expect(nextVersion('1.2.3', 'major')).toBe('2.0.0');
    expect(nextVersion('1.2.3', 'minor')).toBe('1.3.0');
    expect(nextVersion('1.2.3', 'patch')).toBe('1.2.4');
  });

  it('rejects a non-strict current version', () => {
    expect(() => nextVersion('v1.2.3', 'patch')).toThrow(/strict SemVer/);
  });

  it('rewrites only the manifest version line without reformatting', () => {
    const input = '{\n  "name": "x",\n  "version": "1.2.3",\n  "dependency": "4.5.6"\n}\n';
    expect(withVersion(input, '2.0.0')).toBe(
      '{\n  "name": "x",\n  "version": "2.0.0",\n  "dependency": "4.5.6"\n}\n',
    );
  });

  it('rejects a manifest without its own version line', () => {
    expect(() => withVersion('{"name":"x"}\n', '2.0.0')).toThrow(/found 0/);
  });

  it('rejects a manifest with two version lines', () => {
    const input = '{\n  "version": "1.0.0",\n  "version": "2.0.0"\n}\n';
    expect(() => withVersion(input, '3.0.0')).toThrow(/found 2/);
  });

  it('inserts a release marker above the first level-two heading', () => {
    const input = '# Changelog\n\nPreamble.\n\n## 2026-07-28\n\nEntry.\n';
    expect(withReleaseHeading(input, '1.0.0', '2026-07-28')).toBe(
      '# Changelog\n\nPreamble.\n\n## v1.0.0 — 2026-07-28\n\n## 2026-07-28\n\nEntry.\n',
    );
  });

  it('rejects a duplicate release marker', () => {
    expect(() =>
      withReleaseHeading('# Changelog\n\n## v1.0.0 — 2026-07-28\n', '1.0.0', '2026-07-28'),
    ).toThrow(/already contains/);
  });

  it('rejects a changelog without a level-two heading', () => {
    expect(() => withReleaseHeading('# Changelog\n', '1.0.0', '2026-07-28')).toThrow(
      /no level-two heading/,
    );
  });

  it('tells a major cut to re-cut the snapshot after any later branch commit', () => {
    const steps = nextSteps('2.0.0', 'major');
    expect(steps).toContain('the 2.x snapshot is a copy of website/docs as it stands');
    expect(steps).toContain('re-cut it before merging');
    expect(nextSteps('2.0.1', 'patch')).not.toContain('re-cut');
  });

  it('sends every bump to the doc-lint-checked version tokens', () => {
    expect(nextSteps('2.0.1', 'patch')).toContain('release-version tokens to 2.0.1');
    expect(nextSteps('2.0.0', 'major')).toContain('pnpm run doc-lint names every page');
  });

  it('names major snapshots and selects only major bumps', () => {
    expect(snapshotName('12.3.4')).toBe('12.x');
    expect(() => snapshotName('12.x')).toThrow(/strict SemVer/);
    expect(needsSnapshot('major')).toBe(true);
    expect(needsSnapshot('minor')).toBe(false);
    expect(needsSnapshot('patch')).toBe(false);
  });
});
