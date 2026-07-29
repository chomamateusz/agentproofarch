import { describe, expect, it } from 'vitest';

import pkg from '../../../../package.json' with { type: 'json' };

import {
  BUILD_SHA,
  BUILD_VERSION,
  DOCS_URL,
  buildBannerLine,
  buildStampText,
  isStaleBundle,
  shortSha,
} from './build-info.js';

describe('build info', () => {
  it('shortens attested SHAs and preserves unknown', () => {
    expect(shortSha('abcdef123456')).toBe('abcdef1');
    expect(shortSha('unknown')).toBe('unknown');
  });

  it('derives the local build stamp and console banner from the manifest', () => {
    expect(BUILD_VERSION).toBe(pkg.version);
    expect(BUILD_SHA).toBe('unknown');
    expect(buildStampText()).toBe(`v${pkg.version}`);
    expect(buildBannerLine()).toBe(`agentproofarch v${pkg.version} · docs ${DOCS_URL}`);
  });

  it('detects a server version mismatch', () => {
    expect(isStaleBundle({ version: '999.0.0', sha: 'unknown' })).toBe(true);
  });

  it('accepts an identical unattested build', () => {
    expect(isStaleBundle({ version: BUILD_VERSION, sha: BUILD_SHA })).toBe(false);
  });

  it('does not turn an unknown server SHA into a mismatch', () => {
    expect(isStaleBundle({ version: BUILD_VERSION, sha: 'unknown' })).toBe(false);
  });

  it('does not turn an unknown build SHA into a mismatch', () => {
    expect(BUILD_SHA).toBe('unknown');
    expect(isStaleBundle({ version: BUILD_VERSION, sha: 'different-sha' })).toBe(false);
  });
});
