# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project carries **no version numbers**: a release is a branch promotion
(`main` → `production`, owner-approved PR), so entries are grouped by the **UTC
date their pull request merged** instead of by version.

This file was backfilled on 2026-07-26 from merged pull-request history and starts
at PR [#45](https://github.com/chomamateusz/agentproofarch/pull/45); everything
before that lives in the git history only.

## 2026-07-26

### Added

- Vercel domain-provisioning adapter (US-020): `DOMAIN_PROVISIONER=vercel` attaches
  each tenant host to the Vercel project over the Domains API for a per-host HTTP-01
  certificate, selected explicitly with `VERCEL_TOKEN` + `VERCEL_PROJECT_ID`
  (+ `VERCEL_TEAM_ID`) and refusing to boot on an incomplete block. Proven against a
  stubbed `fetch` only; the first live add/check/remove is the acceptance run
  ([#62](https://github.com/chomamateusz/agentproofarch/pull/62)).
- Documentation site: Docusaurus 3 under `website/`, published to GitHub Pages by
  `docs-deploy.yml`, with `docs-ci.yml` failing a PR on a broken link or a broken
  build. The site's changelog page is generated from this file, and a standing
  convention now requires a behaviour-visible change to update `website/docs` and
  add an entry here in the same PR.

## 2026-07-25

### Added

- Visual-regression suite: Playwright `toHaveScreenshot()` over the existing e2e
  boot harness, in its own config, with baselines rendered by the linux CI runner
  and a deliberately non-required `visual` job (ADR-0008)
  ([#60](https://github.com/chomamateusz/agentproofarch/pull/60)).
- Backup/DR package for the owner's k3s VPS: hourly encrypted `pg_dump` CronJob,
  offsite upload with checksum, restore script and runbook, with the Docker
  self-host stack as cold standby
  ([#59](https://github.com/chomamateusz/agentproofarch/pull/59)).

### Changed

- Session-audit hardening pass over the cold-start retry, the log channel and
  visual exactness ([#61](https://github.com/chomamateusz/agentproofarch/pull/61)).

### Fixed

- `ai-review` gate: same-slot retry on the known cold-start signature
  (claude-code#23265) ([#57](https://github.com/chomamateusz/agentproofarch/pull/57)).
- `ai-review` gate: structured-output wiring corrected, un-masking the real slot
  failure behind the cold starts
  ([#58](https://github.com/chomamateusz/agentproofarch/pull/58)).

## 2026-07-24

### Added

- Fail-closed `ai-review` CI gate (DECIDE F1): only a positive PASS verdict is
  green; it runs on every non-draft PR to `main` and stays non-required until the
  owner adds it to the ruleset
  ([#54](https://github.com/chomamateusz/agentproofarch/pull/54)).

### Fixed

- e2e harness frees the port before boot, killing the `EADDRINUSE` startup flake
  filed as a P1 ([#55](https://github.com/chomamateusz/agentproofarch/pull/55)).

### Documentation

- Deploy topology and tenant addressing corrected to verified reality: `main` is
  staging, `production` is the release branch, and Vercel's shared apex cannot host
  tenant subdomains ([#53](https://github.com/chomamateusz/agentproofarch/pull/53)).

## 2026-07-21

### Added

- Passkeys wired end to end behind `AuthClientPort` (US-028a)
  ([#50](https://github.com/chomamateusz/agentproofarch/pull/50)).
- Auth methods package: magic-link sign-in, TOTP 2FA, social sign-in seam, member
  binding and the `EmailPort` behind them (US-026/US-028a)
  ([#47](https://github.com/chomamateusz/agentproofarch/pull/47)).
- Owner-decision batch: SES email adapter, Mailpit dev mail, C1 write atomicity,
  C3 invariant placement, C4 backfills, B5 agent hygiene and the F2 migration lint
  ([#48](https://github.com/chomamateusz/agentproofarch/pull/48)).

### Changed

- zod migrated 3 → 4 across the full stack — the named unblock for the passkey
  plugin's peer requirement
  ([#50](https://github.com/chomamateusz/agentproofarch/pull/50)).

### Removed

- The dead `coderoadpl` mirror workflow; the repository is public and the mirror
  repository is deleted
  ([#52](https://github.com/chomamateusz/agentproofarch/pull/52)).

### Documentation

- Deploy topology, the release runbook and per-environment tenant addressing
  recorded ([#49](https://github.com/chomamateusz/agentproofarch/pull/49)).
- Deferred-work register created, persisting the audit DEFER lists and verification
  residuals with named triggers
  ([#45](https://github.com/chomamateusz/agentproofarch/pull/45)).

### Released

- First production promotion under the new topology (zod 4 + passkeys), merged to
  the `production` branch
  ([#51](https://github.com/chomamateusz/agentproofarch/pull/51)).
