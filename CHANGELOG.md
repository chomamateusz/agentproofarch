# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project carries **no release version numbers**: a release is a branch promotion
(`main` → `production`, owner-approved PR), so entries are grouped by the **UTC
date their pull request merged** instead of by version.

This file was backfilled on 2026-07-26 from merged pull-request history and starts
at PR [#45](https://github.com/chomamateusz/agentproofarch/pull/45); everything
before that lives in the git history only.

## 2026-07-26

### Added

- Project brand assets: layered-mark logo in the docs-site navbar, favicon
  refreshed to the slanted mark, social card for link previews and a README
  banner ([#72](https://github.com/chomamateusz/agentproofarch/pull/72)).
- CodeRabbit as an advisory second reviewer: `.coderabbit.yaml` (chill
  profile, no request-changes, doctrine path instructions); comments on
  every non-draft PR without ever blocking one
  ([#69](https://github.com/chomamateusz/agentproofarch/pull/69)).

- Vercel domain-provisioning adapter (US-020): `DOMAIN_PROVISIONER=vercel` attaches
  each tenant host to the Vercel project over the Domains API for a per-host HTTP-01
  certificate, selected explicitly with `VERCEL_TOKEN` + `VERCEL_PROJECT_ID`
  (+ `VERCEL_TEAM_ID`) and refusing to boot on an incomplete block. Proven against a
  stubbed `fetch` only; the first live add/check/remove is the acceptance run
  ([#62](https://github.com/chomamateusz/agentproofarch/pull/62)).
- Documentation site: Docusaurus 3 under `website/`, published to GitHub Pages by
  `docs-deploy.yml`, with `docs-ci.yml` reporting a broken link or build on PRs
  (a non-required check). The site's changelog page is generated from this file, and a standing
  convention now requires a behaviour-visible change to update `website/docs` and
  add an entry here in the same PR.
- Mermaid parse gate for the docs site (`npm run check:mermaid`): mermaid renders
  client-side, so a green Docusaurus build never parses a diagram. The check feeds
  every fenced block to mermaid's own parser and fails on a syntax error; it runs in
  `docs-ci.yml` beside `typecheck` and in `docs-deploy.yml` before the Pages upload.
- Observability page on the docs site, condensed from the normative
  `docs/observability.md`: the wide-event doctrine, the three instrumentation
  chokepoints, and a matrix of what is wired today versus written down only.

### Changed

- The docs-site landing page opens with the brand banner, the same asset the
  README uses ([#TBD](https://github.com/chomamateusz/agentproofarch/pull/TBD)).
- The docs-site landing title spells the name out — "Agent-Proof Architecture" —
  with the `agentproofarch` slug demoted to the gloss line ([#76](https://github.com/chomamateusz/agentproofarch/pull/76)).
- Owner round-3 docs notes: the landing page slims down — the four boot commands
  now live only in the quickstart, the walking-skeleton capability list moves to
  the top of the quickstart as "What you get after boot", and "The architecture,
  in plain words" becomes the glossary's introduction ([#75](https://github.com/chomamateusz/agentproofarch/pull/75)).
- Docs-site landing page rewritten for the mid-level-developer audience — name
  gloss in the header, a problem→answer section up front, terms defined at first
  use — and admonition titles across the site fixed to the `:::type[Title]`
  bracket syntax ([#73](https://github.com/chomamateusz/agentproofarch/pull/73)).
- Owner round-2 docs notes: quickstart env step now says plainly that local dev
  needs no `.env`, the glossary merges Feature/Island, glosses seam and rung,
  states that owner/admin are per-tenant grants with no platform super-admin,
  and rewrites the foundation-lifecycle section around the fork scenario; the
  authorization page gains a plain-words tenant-creation flow
  ([#74](https://github.com/chomamateusz/agentproofarch/pull/74)).
- Toolchain upgraded from Node.js 22 to Node.js 24 LTS across local pins, CI,
  Docker, engines and documentation, with npm 11 lockfile semantics
  ([#71](https://github.com/chomamateusz/agentproofarch/pull/71)).
- Root README slimmed to a front door — attribution, the documentation
  site, live demo, minimal quickstart and the repo map; the layer diagram,
  gate details and environment matrix now live on the docs site
  ([#70](https://github.com/chomamateusz/agentproofarch/pull/70)).

### Fixed

- Documentation accuracy pass: ruleset descriptions now mirror the live,
  API-verified configuration (both rulesets merge-commit-only; `ai-review`
  required on `main-gates` since 2026-07-26), and the landing
  page no longer claims that every capability is reachable through the public API
  (it exposes two read-only routes) or that the project carries no version number
  at all (`demo/package.json` is `0.1.0`, served by the health endpoints).
- Every `actions/checkout` pin now carries the `# v4.3.0` version comment that
  ADR-0004 §5 promises for every `uses:`.
- `doc-lint`'s dead-relative-link check no longer flags a **build-generated** doc as
  missing. The generated targets are a literal path list (today just
  `website/docs/changelog.md`), so a real typo still fails the gate.

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
