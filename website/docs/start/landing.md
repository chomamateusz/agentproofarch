---
title: Agent-Proof Architecture
slug: /
sidebar_label: 🔷 What & why
description: An agent-first, strictly layered TypeScript foundation for multi-tenant SaaS.
---

# Agent-Proof Architecture 🔷 \{#agent-proof-architecture}

![agentproofarch — agent-first · strictly layered · multi-tenant](../../static/img/banner.png)

**agentproofarch** — a strictly layered full-stack TypeScript foundation that
keeps its structure no matter how much of the code an AI agent writes.

When an agent writes most of the code, the thing that decays first is not
correctness — it is *structure*. A generated change lands wherever it compiles.
The seams — the declared boundaries between parts of the system — blur. Six
weeks later nobody can say where the boundary between the database and the
domain went.

agentproofarch is the answer to that specific failure. Every boundary is
machine-enforced by lint, so structure cannot drift silently. Every capability
short of the browser-bound sign-in ceremonies is drivable from a CLI with
machine-readable output, so work can be verified without a browser — by you or
by the agent itself.

The architecture is written down first (`docs/architecture.md` is normative),
the enforcers are written down next, and `demo/` is a running reference
implementation of both.

A free, open project by **Mateusz Choma**, developed privately in collaboration
with **[CodeRoad.pl](https://coderoad.pl)** and
**[AmazingDesign.eu](https://amazingdesign.eu)**.

## What problem does it solve 🎯 \{#what-problem-does-it-solve}

If you have watched an AI-assisted codebase rot, you already know these:

| Your problem | The answer here |
|---|---|
| Generated code lands wherever it compiles; layering erodes PR by PR | Layer boundaries are lint rules (`eslint-plugin-boundaries` + dependency-cruiser). A misplaced import **fails the build**. |
| Merged, typechecked — and does not boot | "Done" is two green gates: **`check`** (static — typecheck, lint, boundary rules, unit tests) **and** **`smoke`** (runtime — boots the real server on a real database and drives it through the CLI). |
| The agent verifying its own work through a browser is slow, token-hungry and probabilistic | Every capability short of the browser-bound sign-in ceremonies is drivable from the CLI with `--json` output and deterministic exit codes — no browser in the loop. |
| Multi-tenancy bolted on later, painfully | Tenants, subdomains and custom domains are in the skeleton from day one. |
| Locked into one platform | Externals sit behind **ports and adapters**: the core declares the interfaces it needs (ports), thin replaceable modules (adapters) implement them. The same commit runs on Vercel and in Docker. |
| Docs drift from the code | Docs-first rule (`docs/architecture.md` is normative) plus a `doc-lint` cross-check in CI that verifies docs against the enforcers and the source tree. |

Those answers roll up into the four promises the architecture makes
([architecture.md](https://github.com/chomamateusz/agentproofarch/blob/main/docs/architecture.md),
"The promise"):

1. **An agent works, and the architecture does not move.** Generated change
   lands inside the seams; drift is a red gate, not a slow surprise.
2. **The platform is replaceable without a rewrite.** Deploy target, database
   driver and auth provider are adapter choices — one edit in one file, not a
   migration.
3. **A feature enters and leaves touching nothing but its declared
   interfaces.** Adding or removing one changes that slice and its seams,
   nothing else.
4. **Everything is testable.** Cores are pure and test without frameworks; the
   rest is driven end-to-end by the gates — static, runtime, browser.

## Start here 🚀 \{#start-here}

Four commands boot a working demo on your machine, right now — multi-tenancy
included, on localhost, with seeded data (a demo account and two tenants). The
[Quickstart](./quickstart.md) has the commands, with every prerequisite, seed
value and sharp edge spelled out.

What boots is a **walking skeleton** — the thinnest version of the real system
with every layer connected and actually working — not a scaffold of stubs. Each
capability flows through *every* layer and is drivable from both the web app
and the CLI; the [top of the Quickstart](./quickstart.md#what-you-get-after-boot)
lists them all.

From there:

- **[CLI walkthrough](../guides/cli-walkthrough.md)** — the agent feedback loop,
  command by command.
- **[Adding a feature](../guides/adding-a-feature.md)** — the scaffolder (a
  generator that plants a new resource) and the 12-step wiring checklist.
- **[Layers](../architecture/layers.md)** and
  **[ADRs](../decisions/index.md)** — why the seams sit where they do.
- **[Agent workflow](../guides/agent-workflow.md)** — how this repository is
  actually developed.

Every term this site uses is defined in the [glossary](./glossary.md), which
opens with the architecture in plain words; the full structural story is in
[Layers](../architecture/layers.md).

## The feature map 🗺️ \{#the-feature-map}

Every capability is reachable through the web app and, with three deliberate
exceptions, through the CLI — and the CLI path is the one an agent uses,
because it is the only one with machine-readable output and a taxonomy-mapped
exit code. The exceptions are the browser-bound sign-in ceremonies — TOTP
enrollment, passkeys, Google — which only the web app drives.

The third surface is deliberately *not* a third door onto everything: the
public API exposes two unauthenticated read-only routes over one tenant profile
(`slug`, `displayName`, `contentVersion`) and nothing else, by construction
rather than by exception
([ADR-0006](../decisions/0006-public-read-only-surface.md)).

```mermaid
graph LR
  subgraph surfaces["Drive surfaces"]
    web["Web SPA<br/>React · TanStack · MUI"]
    cli["CLI<br/>--json · exit codes"]
    pub["Public API<br/>no session · cacheable"]
  end

  subgraph seam["core/contract — the app seam"]
    routes["API_ROUTES + zod schemas"]
    publicRoutes["PUBLIC_API_ROUTES<br/>its own registry"]
  end

  authRoutes["Better Auth /api/auth/*<br/>via the auth adapters"]

  subgraph caps["Capabilities in the walking skeleton"]
    auth["Auth: password · magic link<br/>TOTP · passkey · Google seam"]
    tenants["Tenants + staff grants<br/>owner / admin"]
    members["Members: ensure · update<br/>remove · GDPR export"]
    work["Todos + two boards<br/>personal · guarded team"]
    domains["Custom domains<br/>add · check · remove"]
    health["Health + attestation<br/>live · ready · commit SHA"]
    profile["Public tenant profile<br/>read-only · 2 routes"]
  end

  subgraph gates["How it stays true"]
    check["check — static"]
    smoke["smoke — runtime"]
    e2e["e2e — browser"]
  end

  web --> routes
  cli --> routes
  web --> authRoutes
  cli --> authRoutes
  pub --> publicRoutes
  authRoutes --> auth
  routes --> tenants
  routes --> members
  routes --> work
  routes --> domains
  routes --> health
  publicRoutes --> profile

  caps --> check
  caps --> smoke
  caps --> e2e

  classDef highlight fill:#dbeafe,stroke:#2563eb,color:#1e3a5f;
  class routes highlight;
```

Read the structure top-down in [Layers](../architecture/layers.md), then follow a
single request through it in
[Request lifecycle](../architecture/request-lifecycle.md).

## How it defends itself 🛡️ \{#how-it-defends-itself}

| Gate | Command | What it proves | Required check? |
|---|---|---|---|
| **Static** | `pnpm run check` | typecheck (incl. the island TS project) + ESLint boundaries + `lock-lint` + dependency-cruiser + knip + `doc-lint` + vitest with a coverage ratchet | yes — `check` |
| **Runtime** | `pnpm run smoke` | recreates an isolated database, boots the real server, drives health → sign-in → todos → unauthorized through the CLI asserting taxonomy exit codes | yes — `smoke` |
| **Browser** | `pnpm run e2e` | a real Chromium over the real stack: 15 tests across 6 spec files | yes — `e2e` |
| **Container** | `selfhost.yml` | builds the image, boots `docker-compose.prod.yml`, smokes the container through the CLI | yes — `docker-smoke` |
| **Pixel** | `pnpm run visual` | Playwright `toHaveScreenshot()` against CI-rendered baselines ([ADR-0008](../decisions/0008-visual-regression.md)) | **no** — by design |
| **Review** | `ai-review.yml` | fail-closed AI diff review; only a positive `PASS` verdict is green | **yes**, on `main` (since 2026-07-26) |

:::danger[Done = `check` green AND `smoke` green]
Static-green is not done. A typechecked, linted commit that does not boot is a
red commit. And a red gate is never rerun to green: **a flake is a P1 bug**
(owner ruling, DECIDE F3) — a red gate means the commit is wrong or the gate is
wrong, and one of them gets fixed.
:::

Underneath those gates: **88** test files in the database-free run, **48**
integration tests against a real Postgres, **15** Playwright tests, and **48**
config-regression probes that guard the enforcers themselves — most feed a
deliberately illegal fixture and assert rejection; the rest are structural
scans and non-vacuity guards over the real source — so a silently weakened rule
fails CI instead of passing quietly. Those counts sit in the repository's own
READMEs as machine-checked tokens that `doc-lint` re-verifies against the
source tree on every `check`. See
[Testing doctrine](../guides/testing-doctrine.md) and
[CI gates](../operations/ci-gates.md).

## Live demo 🖥️ \{#live-demo}

[agentproofarch.vercel.app](https://agentproofarch.vercel.app) — sign in as
`demo@agentproofarch.dev` / `demo1234`. The deployed web app is single-tenant on
`*.vercel.app` (Vercel refuses tenant subdomains under a project's own
`*.vercel.app` apex, so a wildcard base domain is an environment concern, not a
code one — [ADR-0003](../decisions/0003-vercel-environments.md)); the API and CLI
stay fully multi-tenant via the `X-Tenant` header.

## Honest status 🚦 \{#honest-status}

- **Vercel target: live. Docker self-host: built** and proven on every PR and push
  to `main` by the `docker-smoke` job — a multi-stage `Dockerfile`, `docker-compose.prod.yml`
  with an `edge`-profiled Caddy for on-demand TLS, and migrations run by the
  container entrypoint.
- **The Vercel Domains provisioning adapter (US-020) is built but has never run
  against the live API** — proven against a stubbed `fetch` only, because no
  `VERCEL_TOKEN` exists on CI or the build machine. Full statement:
  [US-020: built, and never run live](../operations/self-host-and-domains.md#us-020-built-and-never-run-live).
- **Two CI jobs run but block nothing.** `visual` (pixel) and `docs-build`
  (this site) report without gating until the owner arms them; `ai-review`
  has been a required `main-gates` check since 2026-07-26.
  Adding a status check to a ruleset is Admin-only — which the agent account
  deliberately is not.
- **`ai-review` has one token slot provisioned.** `CLAUDE_CODE_OAUTH_TOKEN_1` is
  present; slots `_2` and `_3` are wired in the workflow and skip cleanly while
  absent. The gate is fail-closed by construction: an infra failure on every
  available slot is RED, never a silent pass.
- **Accepted-but-deliberately-unbuilt work is written down**, each entry with a
  named trigger, in the
  [deferred-work register](https://github.com/chomamateusz/agentproofarch/blob/main/docs/backlog.md)
  — day-2 operations, threat model, feature flags, forms doctrine, a11y, i18n,
  per-tenant SSO. When a trigger fires the entry graduates into an ADR or an
  implementation slice; it never gets built silently.

:::note[This is a reference implementation, not a package]
`demo/package.json` is `private: true` and nothing is published to npm. There is
no release versioning either: a release is a branch promotion
(`main` → `production`), the repository carries no version tags, and the
[changelog](../changelog.md) groups entries by merge date rather than by version. The
one version number that carries meaning — `0.1.0` in `demo/package.json`; the
website's `package.json` holds an inert `0.0.0` placeholder — is the build's
release identity, served as the `version` field of every successful health
response ([Health & attestation](../operations/health-and-attestation.md)); a
failing readiness probe answers with a bare `unavailable` error envelope
instead, and nothing bumps the number on promotion. You read it, fork it, or lift patterns out of it. CLI
distribution and a version handshake sit on the
[deferred-work register](https://github.com/chomamateusz/agentproofarch/blob/main/docs/backlog.md)
with "first external CLI consumer" as the named trigger.
:::

## Where the truth lives 📚 \{#where-the-truth-lives}

The authoritative documents remain in the repository:
[`docs/architecture.md`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/architecture.md)
(normative) and the
[PRD](https://github.com/chomamateusz/agentproofarch/blob/main/docs/prd-agentproofarch-foundation.md)
(§3 is the contract). This site condenses them; where the two disagree, the
repository wins.
