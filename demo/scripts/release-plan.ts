export type Bump = 'major' | 'minor' | 'patch';

const STRICT_SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export const releaseBumpArgument = (args: readonly string[]): string | undefined =>
  args[0] === '--' ? args[1] : args[0];

export const nextVersion = (current: string, bump: Bump): string => {
  const match = STRICT_SEMVER.exec(current);
  if (match === null) throw new Error(`Version is not strict SemVer: ${current}`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

export const withVersion = (manifestText: string, next: string): string => {
  const pattern = /^(\s*"version"\s*:\s*")([^"]*)(",?\s*)$/gm;
  const matches = [...manifestText.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one manifest version line, found ${matches.length}`);
  }
  return manifestText.replace(pattern, `$1${next}$3`);
};

export const withReleaseHeading = (
  changelogText: string,
  version: string,
  isoDate: string,
): string => {
  if (changelogText.includes(`## v${version}`)) {
    throw new Error(`Changelog already contains v${version}`);
  }
  const heading = /^## /m.exec(changelogText);
  if (heading === null || heading.index === undefined) {
    throw new Error('Changelog has no level-two heading');
  }
  return `${changelogText.slice(0, heading.index)}## v${version} — ${isoDate}\n\n${changelogText.slice(heading.index)}`;
};

export const snapshotName = (version: string): string => {
  const match = STRICT_SEMVER.exec(version);
  if (match === null) throw new Error(`Version is not strict SemVer: ${version}`);
  return `${match[1]}.x`;
};

export const needsSnapshot = (bump: Bump): boolean => bump === 'major';
