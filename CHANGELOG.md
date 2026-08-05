# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Entries stay grouped by the **UTC date their pull request merged**. A dedicated
release-cut pull request to `main` inserts a `## vX.Y.Z — YYYY-MM-DD` marker
above the newest date section; everything between one marker and the next
shipped in that release.

This file was backfilled on 2026-07-26 from merged pull-request history and starts
at PR [#45](https://github.com/chomamateusz/agentproofarch/pull/45); everything
before that lives in the git history only.

## 2026-08-05

### Added

- `.github/CODEOWNERS` routing every path to `@chomamateusz`, so
  `production-protection`'s code-owner review requirement binds on a real owner
  instead of on an empty owner set; the audit, the backlog and the normative
  ruleset tables now record the live rule, review-thread resolution included
  ([#130](https://github.com/chomamateusz/agentproofarch/pull/130))

## v1.4.0 — 2026-08-03

## 2026-08-03

### Added

- Advisory JavaScript/TypeScript CodeQL scanning on pull requests to `main` and
  weekly, reporting to the Security tab without becoming a required check
  ([#126](https://github.com/chomamateusz/agentproofarch/pull/126))

- Renovate configuration for one weekly grouped non-major update pull request,
  majors kept separate and weekly lockfile maintenance, all under the same
  three-day release cooldown both pnpm roots enforce; the bot only starts once
  the repository owner installs the Renovate GitHub App
  ([#126](https://github.com/chomamateusz/agentproofarch/pull/126))

### Security

- Email verification is now sent on sign-up and stays soft — an unconfirmed
  account signs in and works normally, and the only capability withheld is
  `tenant:create`, decided in the domain policy so `canCreateTenant` reports the
  same verdict the create route enforces
  ([#125](https://github.com/chomamateusz/agentproofarch/pull/125))

- Session lifetime is pinned explicitly at a 7-day absolute expiry with a 1-day
  activity refresh, and 2FA at 10 backup codes with 6-digit TOTP on a 30-second
  period; a config-regression probe reads all five values back off the composed
  provider options
  ([#125](https://github.com/chomamateusz/agentproofarch/pull/125))

- Account passwords require 12 characters and no character classes (NIST SP
  800-63B-4 §3.1.1), enforced by one constant on both edges — the web register,
  change-password and reset forms and the auth provider's own minimum
  ([#125](https://github.com/chomamateusz/agentproofarch/pull/125))

### Changed

- Demo credentials changed from `demo@agentproofarch.dev` / `demo1234` to
  `demo@agentproofarch.dev` / `demo-agentproof-1234` everywhere (seed, READMEs,
  login-page hint, smoke and e2e fixtures, docs) so the shipped demo satisfies
  the new 12-character floor
  ([#125](https://github.com/chomamateusz/agentproofarch/pull/125))

### Fixed

- The deployed demo fixture now converges on every deployment: `vercel-build`
  runs the convergent `db:seed` after `db:migrate`, so the published credentials
  are true on the live demo instead of frozen at whatever the database was first
  seeded with, and `post-deploy-smoke` stops failing 401 after a password
  rotation; the seed inserts and updates fixtures only, so visitor-created rows
  survive ([#127](https://github.com/chomamateusz/agentproofarch/pull/127))

- `db:seed` resolves its Postgres driver from `DB_DRIVER` like `db:migrate`
  does, instead of hardcoding `node-postgres` — the shared config comment already
  promised both build-time entry points resolved it identically
  ([#127](https://github.com/chomamateusz/agentproofarch/pull/127))

## v1.3.0 — 2026-08-02

## 2026-08-02

### Added

- Deployment risk classes guide (SIL-0 through SIL-3): one classifying question
  — who is hurt by an outage, and how much — decides repository visibility and
  plan, hosting tier, the recoverability requirements that replace a merge wall
  where none can be enforced, and whether an agent may deploy production on its
  own ([#119](https://github.com/chomamateusz/agentproofarch/pull/119))

### Security

- Auth hardening now challenges TOTP-enrolled accounts after password, magic-link,
  Google and passkey sign-in with TOTP or a backup code; keys auth rate limits to
  a non-spoofable client address through direct Node and Caddy paths; confines
  password-reset callbacks to their requesting origin over HTTPS; and requires
  password-backed sensitive sessions for passkey add/remove, while tenant-creation
  controls render only when the server capability decision allows them
  ([#122](https://github.com/chomamateusz/agentproofarch/pull/122))

- `SECURITY.md`: the supported release line (latest minor of the current major,
  no backports), a private reporting channel that is not a public issue, a
  best-effort response stated without an SLA, and a scope split that puts the
  public demo deployment and its published credentials out of bounds while the
  foundation code stays in
  ([#120](https://github.com/chomamateusz/agentproofarch/pull/120))

- First OpenSSF Scorecard run, mechanical findings only: the two remaining
  workflow-level write tokens moved onto the single job that needs each
  (`visual-baselines`' baseline push, `ai-review`'s verdict comment), so every
  workflow top level is now read-only, and `demo/Dockerfile` pins its three
  `node:24-bookworm`(`-slim`) base layers by digest beside the tag.
  `Token-Permissions` still cannot reach 10 — seven jobs hold a job-scoped
  write their work requires — which `docs/audits/ci-security.md` now enumerates
  instead of predicting a clean score
  ([#120](https://github.com/chomamateusz/agentproofarch/pull/120))

### Changed

- Completeness-audit status, evidence, ASVS anchors, severity, mechanical inputs, and passkey posture corrected against the shipped implementation
  ([#121](https://github.com/chomamateusz/agentproofarch/pull/121))

## v1.2.0 — 2026-08-01

## 2026-08-01

### Added

- Forgot-password flow: a `forgot password?` link on the login card leads to an
  email-only request form whose answer is identical for an address with an
  account and one without, the reset mail goes out through the existing
  `EmailPort`, and its link opens a `/reset-password` form that applies the
  registration password policy and hands the visitor back to sign-in. The CLI
  covers the request half as `account request-password-reset`; the completion
  half needs the emailed token and stays in the web app
  ([#116](https://github.com/chomamateusz/agentproofarch/pull/116))

- Every audit spec under `docs/audits/` now names the versioned standard it is
  anchored to and which of its checks a tool actually performs — application
  security and identity against OWASP ASVS 5.0.0 (V6, V7) as an ASVS-derived L2
  profile plus NIST SP 800-63B-4, supply chain against OpenSSF Scorecard 5.5.0
  checks and SLSA v1.2 as a stated position, authorization parity against ASVS
  V8 — with two new specs, accessibility (WCAG 2.2 AA and axe-core, carrying the
  57.38% automated-detection caveat) and performance (Core Web Vitals with
  Lighthouse CI as the lab instrument), and two advisory non-required jobs
  feeding them: `scorecard.yml` (weekly OpenSSF Scorecard, SARIF to the Security
  tab) and `lhci.yml` (Lighthouse CI over the built documentation site, every
  assertion at `warn`)
  ([#115](https://github.com/chomamateusz/agentproofarch/pull/115))

- Account passwords can be changed from web settings or the CLI, with an
  option to invalidate every other active session; the CLI stores the session
  token that revoke rotates, so it keeps working afterwards
  ([#114](https://github.com/chomamateusz/agentproofarch/pull/114))

- Every recurring audit type now has a written spec under `docs/audits/`
  (docs-truth, ci-security, dependencies, dead-code-and-test-gaps,
  consistency, external-links, and the new completeness audit checked
  against the PRD and a living table-stakes SaaS checklist), plus an index
  stating the doctrine and a website mirror page
  ([#113](https://github.com/chomamateusz/agentproofarch/pull/113))

- The visual review gallery comment now shows a **Before / After** pair for every
  baseline PNG a pull request re-renders and commits, read from the pull-request
  file list and served from the base and head commits — the deliberate UI change
  compares green by construction and GitHub collapses its image diff, so this was
  the one case the gallery could not show ([#112](https://github.com/chomamateusz/agentproofarch/pull/112))

- Commits and PR titles follow a gitmoji-style convention with a fixed emoji
  per recurring PR type, documented in root `CLAUDE.md` and the agent workflow
  guide; enforced by human review, not a hook
  ([#111](https://github.com/chomamateusz/agentproofarch/pull/111))

## v1.1.1 — 2026-08-01

## 2026-08-01

### Fixed

- The web app shows a branded boot splash — wordmark, tenant host, an
  indeterminate rule and the version stamp — while the session and tenant
  bootstrap is unresolved, so the authenticated navigation no longer flashes for
  logged-out visitors, and a cold start admits "warming up the server…" after
  four seconds ([#108](https://github.com/chomamateusz/agentproofarch/pull/108))

## v1.1.0 — 2026-07-29

## 2026-07-29

### Added

- `doc-lint` verifies the release version quoted by the documentation against
  `demo/package.json`, so a version bump that leaves those pages stale fails
  `pnpm run check`
  ([#106](https://github.com/chomamateusz/agentproofarch/pull/106))

- Domain add/check responses now surface provisioner-required ownership and
  pointing DNS records through the API, CLI, and domains settings view
  ([#103](https://github.com/chomamateusz/agentproofarch/pull/103)).

- Adds the MIT LICENSE file, `license` field in `demo/package.json` and
  `website/package.json`, and an explicit MIT mention on the README and the
  docs landing page
  ([#105](https://github.com/chomamateusz/agentproofarch/pull/105))

### Changed

- Dead exports are cut, the Knip gate declares the intended public API explicitly and rejects new unused exports, and the duplicate `scripts/screenshot.mjs` engine is removed ([#104](https://github.com/chomamateusz/agentproofarch/pull/104))

### Fixed

- The Vercel domain provisioner no longer answers an already-attached host
  (`409`) whose follow-up read fails with an empty required-record list, and
  `check` no longer does so when a verified host's DNS-config read fails: the
  DNS state is unknown in both cases, so the adapter throws and the error
  taxonomy reports it
  ([#103](https://github.com/chomamateusz/agentproofarch/pull/103)).

- Demo upgrades the Hono Node adapter to v2, replaces its removed platform-entry
  export, and moves Drizzle Kit to v1 migration tooling without the vulnerable
  `@esbuild-kit/*` dependency chain
  ([#102](https://github.com/chomamateusz/agentproofarch/pull/102))

## v1.0.0 — 2026-07-28

## 2026-07-28

### Added

- ADR-0014 establishes SemVer releases, additive-only v1 API policy, web and CLI
  version surfaces, release tagging, and major-version documentation snapshots
  ([#100](https://github.com/chomamateusz/agentproofarch/pull/100)).

### Changed

- Release v1.0.0 sets the app version, freezes the documentation as 1.x, adds
  the documentation version selector, and repairs the release command and
  dependency preflight plus the snapshot-safe banner path found by the first cut
  — `doc-lint` now resolves site-absolute links against `website/static/` the
  way Docusaurus serves them, instead of reporting them as missing files
  ([#101](https://github.com/chomamateusz/agentproofarch/pull/101)).

- The release procedure fixes the documentation snapshot as the last step of a
  release cut: any later commit on the release branch that touches
  `CHANGELOG.md` or `website/docs/**` requires re-cutting it before merge, and
  `pnpm run release` prints that rule after a major cut
  ([#101](https://github.com/chomamateusz/agentproofarch/pull/101)).

- CI serializes post-deploy smoke runs per shared target (one group for the
  production alias, per-deployment groups for previews), takes the smoke
  credentials from repository secrets only, restricts docs deploys to `main`,
  gives `post-deploy-smoke` and `selfhost` read-only default permissions, binds
  visual approval renders to the approved SHA, and pins every container image
  referenced in `.github/workflows` — `postgres`, `axllent/mailpit`,
  `minio/minio`, `minio/mc`, `alpine`, `rancher/k3s` — to a `tag@sha256:` digest
  ([#96](https://github.com/chomamateusz/agentproofarch/pull/96)).

- The visual review gallery says **baseline** where Playwright says "expected"
  (column header and published `*-baseline.png` names), gains an advisory
  fail-open **AI read** line per changed screenshot (Claude action on the
  slot-1 token, model from the `VISUAL_VERDICT_MODEL` repository variable,
  default `sonnet`, never a gate), and the CI-gates page states who owns the
  baseline: the PNGs committed under `demo/visual/__screenshots__/linux/chromium/`,
  changed only through a PR that passes the full gates
  ([#94](https://github.com/chomamateusz/agentproofarch/pull/94)).

### Fixed

- Demo pins patched postcss, handlebars, brace-expansion, and fast-uri
  releases, and the website pins patched serialize-javascript
  ([#99](https://github.com/chomamateusz/agentproofarch/pull/99)).

- Documentation now records the real CLI-coverage exceptions, complete local
  quickstart process set, missing ADR-0012 mirror, and current implementation,
  CI, test-count, scaffolder, environment and observability behavior. The
  published website's test counts are machine-checked rather than hand-written:
  `doc-lint` now reads count tokens in the Docusaurus MDX comment spelling as
  well as the HTML-comment one, and a `REQUIRED_COUNT_TOKENS` manifest fails
  `check` when a pinned surface states a count as untokenised prose — so website
  drift is now caught by the gate instead of by review
  ([#97](https://github.com/chomamateusz/agentproofarch/pull/97)).

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
