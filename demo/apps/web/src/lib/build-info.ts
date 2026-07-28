export const BUILD_VERSION = __APP_VERSION__;
export const BUILD_SHA = __APP_COMMIT_SHA__;
export const DOCS_URL = 'https://chomamateusz.github.io/agentproofarch/';
export const CHANGELOG_URL = 'https://chomamateusz.github.io/agentproofarch/changelog';

const UNKNOWN_SHA = 'unknown';

export const shortSha = (sha: string): string => (sha === UNKNOWN_SHA ? sha : sha.slice(0, 7));

export const buildStampText = (): string =>
  BUILD_SHA === UNKNOWN_SHA ? `v${BUILD_VERSION}` : `v${BUILD_VERSION} (${shortSha(BUILD_SHA)})`;

export const buildBannerLine = (): string =>
  `agentproofarch ${buildStampText()} · docs ${DOCS_URL}`;

export const isStaleBundle = (server: { version: string; sha: string }): boolean =>
  server.version !== BUILD_VERSION ||
  (BUILD_SHA !== UNKNOWN_SHA && server.sha !== UNKNOWN_SHA && server.sha !== BUILD_SHA);
