# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project carries **no release version numbers**: a release is a branch promotion
(`main` → `production`, owner-approved PR), so entries are grouped by the **UTC
date their pull request merged** instead of by version.

This file was backfilled on 2026-07-26 from merged pull-request history and starts
at PR [#45](https://github.com/chomamateusz/agentproofarch/pull/45); everything
before that lives in the git history only.

## 2026-07-28

### Changed

- The visual review gallery says **baseline** where Playwright says "expected"
  (column header and published `*-baseline.png` names), gains an advisory
  fail-open **AI read** line per changed screenshot (Claude action on the
  slot-1 token, model from the `VISUAL_VERDICT_MODEL` repository variable,
  default `sonnet`, never a gate), and the CI-gates page states who owns the
  baseline: the PNGs committed under `demo/visual/__screenshots__/linux/chromium/`,
  changed only through a PR that passes the full gates (#94).

## 2026-07-27

### Added

- The visual review loop ships with the ADR-0013 that records it: a new
  `visual-report` job publishes Playwright's expected/actual/diff PNGs to a
  `visual-reports` branch and upserts one pull-request comment with an inline
  gallery, and an owner-only `/approve-visuals` comment (`approve-visuals.yml`)
  dispatches `visual-baselines` with the new `commit: true` input to re-render
  and **commit** the new baselines, so the approval closes in git and GitHub's
  native PNG diff is the final review. Fork pull requests get the artifacts and a
  documented manual path instead ([#92](https://github.com/chomamateusz/agentproofarch/pull/92)).

- ADR-0012 scopes CLI client state per API origin like browser cookies: the
  config file keeps its XDG location but becomes an origin-keyed profile map
  with a `currentOrigin` pointer, `APP_CLI_API_URL`/`APP_CLI_TENANT` override it
  for agents and CI (no token env var by design), a checkout of this repo
  defaults to the local dev server ahead of any stored origin, and a legacy
  single-profile file migrates itself losslessly on first run. `cli origin list`
  and `cli origin use <url>` inspect and switch the active origin without a
  network call, and the config file is now written atomically at mode `0600`
  ([#91](https://github.com/chomamateusz/agentproofarch/pull/91)).

- ADR-0011 makes page skeletons a named structural element: `components/layout/`
  enters the frontend structure with two import rules (the layout-import rule
  mechanical, the "features do not define layouts" mirror honestly review-tier),
  the app shell splits into a stateless `AppShell` plus a thin stateful
  composition, layout skeletons get visual specs on the existing ADR-0008
  harness, and the structural `sx` tier is recorded as normative-when-triggered
  ([#86](https://github.com/chomamateusz/agentproofarch/pull/86)).

- Non-required `dr-acceptance` CI workflow exercises the backup/DR package on
  k3d with PostgreSQL 16, MinIO, encrypted backup rotation, byte-identical
  Compose restore, and corrupted-dump refusal; its first run proved kubectl
  rejects combining `--from-env-file` with `--from-file`, so the workflow and
  the backup README now create the Secret from one combined env file
  ([#85](https://github.com/chomamateusz/agentproofarch/pull/85)).

### Changed

- Agent-capability claims in the docs corrected to current reality: agents can
  verify rendered UI through vision loops, so the CLI-first stance is stated as
  a determinism/cost/speed choice rather than agent blindness
  ([#90](https://github.com/chomamateusz/agentproofarch/pull/90)).

### Fixed

- Quickstart accuracy pass from a fresh-clone retest: nvm listed as a
  prerequisite with a do-not-ignore engine-warning note, the CLI's global
  `~/.config/agentproofarch/config.json` profile disclosed with a
  clean-profile step, the smoke timing claim recalibrated to warm (~5s) vs
  first runs (~20-30s) in the quickstart and `demo/CLAUDE.md`, and the health
  JSON sample updated to the real output's key order
  ([#84](https://github.com/chomamateusz/agentproofarch/pull/84)).

## 2026-07-26

### Added

- Instance-wide `TENANT_CREATION=open|staff|closed` policy switch, defaulting to
  open, controls who may create tenants ([#77](https://github.com/chomamateusz/agentproofarch/pull/77)).
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
- Mermaid parse gate for the docs site (`pnpm run check:mermaid`): mermaid renders
  client-side, so a green Docusaurus build never parses a diagram. The check feeds
  every fenced block to mermaid's own parser and fails on a syntax error; it runs in
  `docs-ci.yml` beside `typecheck` and in `docs-deploy.yml` before the Pages upload.
- Observability page on the docs site, condensed from the normative
  `docs/observability.md`: the wide-event doctrine, the three instrumentation
  chokepoints, and a matrix of what is wired today versus written down only.

### Changed

- Documentation-site readability pass, variant C (variant A's text carried
  onto variant B's structure): the journey sidebar
  (Start here → Build a feature → Run and ship → Productionize → Architecture reference →
  ADRs, with generated-index hubs) and B's four page splits — CLI command
  reference, the `ai-review` gate runbook, Self-host (the Docker target), and
  Troubleshooting first run — each split page carrying variant A's prose, old
  URLs kept on the anchor-bearing halves; factual content reconciled with the
  per-origin CLI profiles
  ([#91](https://github.com/chomamateusz/agentproofarch/pull/91)) and the
  agent-capability corrections
  ([#90](https://github.com/chomamateusz/agentproofarch/pull/90)) that landed on
  main ([#89](https://github.com/chomamateusz/agentproofarch/pull/89)).
- Package management migrated from npm to pnpm with frozen-lockfile gates,
  blocked dependency build scripts, and a three-day release cooldown; the strict
  non-hoisted layout surfaced one phantom dependency — the Docker runtime image
  had been resolving `@opentelemetry/sdk-trace-base` through npm's hoisting, and
  it is now declared as the production dependency it always was
  ([#81](https://github.com/chomamateusz/agentproofarch/pull/81)).
- Owner round-6 docs notes: sidebar entries lead with their emoji (content
  headings keep them trailing), every sidebar emoji is now unique — Quickstart
  moves to 🔥, ADRs to ⚖️ — and the generated changelog page carries a
  📝 sidebar label ([#82](https://github.com/chomamateusz/agentproofarch/pull/82)).
- Owner round-5 docs notes: a meaning-matched trailing emoji on every heading
  site-wide, with 🔷 codified as the official brand emoji ([#80](https://github.com/chomamateusz/agentproofarch/pull/80)).
- Owner round-4 docs notes: sidebar categories relabelled (Start here, Full
  architecture, Step-by-step guides, Infrastructure, ADRs), the glossary moves
  to the head of Full architecture, and the three heaviest reference pages open
  with a "you do not need this to start" on-ramp ([#79](https://github.com/chomamateusz/agentproofarch/pull/79)).
- The docs-site landing page opens with the brand banner, the same asset the
  README uses ([#78](https://github.com/chomamateusz/agentproofarch/pull/78)).
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

- Quickstart audit fixes: the seed is now genuinely idempotent (stable todo ids
  instead of fresh UUIDs, which duplicated the todo set on every re-run) and
  orders its todos deterministically, `docker-compose.dev.yml` names one shared
  `agentproofarch-dev` stack so a second clone stops silently forking the dev
  database — existing checkouts still running the old directory-derived `demo`
  project retire it with `docker compose -p demo down -v` (deletes the old,
  disposable dev volume) before the next `pnpm run db:up`, which now detects the
  legacy stack holding the port and refuses with that remedy —
  `smoke` reaps a server that misses readiness instead of orphaning it
  on the port, the CLI section documents the tenant-switch step and the API the
  CLI needs, and a new `pnpm run quickstart:probe` — wired into the required
  smoke job — asserts those promises against a fresh database
  ([#83](https://github.com/chomamateusz/agentproofarch/pull/83)).
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
