---
title: Quickstart
sidebar_label: Quickstart
description: Clone the repository and get to a green runtime gate.
---

# Quickstart

This page takes you from `git clone` to a green **runtime** gate — the point where
the real server has booted, the CLI has driven a full multi-tenant flow through it,
and you can trust what you are looking at. It is deliberately not a "hello world":
the same five minutes that start the dev server also seed two tenants, a demo
account and a local mail sink, because every one of those is something the gates
and the walkthroughs assume exists. Every command below is copied from
`demo/package.json` and the repository READMEs.

## Prerequisites

| Tool | Version | Why exactly this |
|---|---|---|
| **Node** | 24 (`.nvmrc` pins it) | `engines.node` is `24.x`; the CI runner is Node 24. |
| **npm** | `>=11 <12` | `packageManager` is `npm@11.16.0`, matching the npm major bundled with Node 24; `lock-lint` validates npm 11 semantics. |
| **Docker** | any recent | `npm run db:up` starts Postgres 16 and Mailpit from `docker-compose.dev.yml`. |

Everything runs from `demo/` — it has its own `package.json`. The repository root
holds `docs/` (normative architecture + PRD) and `website/` (this site).

## 1. Clone and install

```bash
git clone https://github.com/chomamateusz/agentproofarch.git
cd agentproofarch/demo
nvm use          # or Corepack — anything that lands you on Node 24 / npm 11
npm ci
```

:::warning Keep npm on the pinned major
`lock-lint` (part of `npm run check`) validates `package-lock.json` under npm 11
semantics — exactly what `npm ci` enforces on the Node 24 CI runner. Add
dependencies with `npx -y npm@11 install <pkg>` so the regenerated lockfile uses
the same npm major as CI.
:::

## 2. Environment: nothing to do (locally)

There is no `.env` step for local development. Every key the server needs has a
dev default in the single env schema (`core/server/config.ts`): `DATABASE_URL`
defaults to
`postgresql://agentproofarch:agentproofarch@localhost:47542/agentproofarch`,
`DB_DRIVER` to `node-postgres` off Vercel, `APP_BASE_DOMAIN` to `localhost`,
`PORT` to `47100`, and `SMTP_HOST`/`SMTP_PORT` to the dev Mailpit. The dev-only
`BETTER_AUTH_SECRET` default is *refused* the moment the process looks deployed
(`VERCEL` set, or `SECURE_COOKIES=true`), so the shortcut cannot leak into a
deployment.

You want `.env.example` in two cases only:

```bash
cp .env.example .env     # for: Docker self-host, or overriding a dev default
```

`.env.example` documents **names only**, and it is also the file `doc-lint` checks
the env schema against — a new env key missing from it fails `check`.

## 3. Database, mail sink, seed

```bash
npm run db:up            # Postgres 16 on 47542 + Mailpit on 47925 (SMTP) / 47980 (UI)
npm run db:migrate       # tsx adapters/db/migrate.ts — applies the drizzle migrations
npm run db:seed          # idempotent; running it twice is a no-op
```

The seed is worth knowing by heart, because the walkthroughs and the e2e specs all
reference it:

| Seeded | Value |
|---|---|
| Account | `demo@agentproofarch.dev` / `demo1234` (name: *Demo User*) |
| Tenant 1 | `acme` — *Acme Sp. z o.o.*, demo user is **owner**, domain `acme.localhost` |
| Tenant 2 | `globex` — *Globex Corp*, demo user is **admin**, domain `globex.localhost` |
| Members | `alice@example.com` (acme, tagged `vip`, `early-adopter`), `mag@example.com` (acme, provisioned with no account yet — binds on first magic-link sign-in), `bob@example.com` (globex) |
| Todos | two in `acme`, one in `globex` |

On success it prints:

```text
Seed applied:
  user     demo@agentproofarch.dev / demo1234
  tenants  http://acme.localhost:47100  http://globex.localhost:47100
```

Mailpit is not optional scenery: there is **no separate dev email transport**. Dev,
CI and e2e all run the real SMTP adapter pointed at Mailpit, which captures sends
instead of delivering them. Read a magic link from its UI at
`http://localhost:47980` — there is no in-app dev route for it.

## 4. Run it

Two dev paths, and picking the wrong one is the most common first-run
frustration:

```bash
npm run dev:web          # Vite + hot reload on 47180 — the canonical frontend path
```

```bash
npm run build:web        # …or a prod-like page: build the SPA first,
npm run dev:server       # then the API + built bundle on http://acme.localhost:47100
```

:::warning `dev:server` serves a gitignored build
`dev:server` serves whatever `dist/web` currently holds. After a contract change a
stale bundle fails **every** page with "response does not match the contract" (a
real incident, 2026-07-12). The server warns at boot when `dist/web` is missing or
older than the web/contract sources; on that warning either `npm run build:web` or
switch to `dev:web`. **All frontend work goes through `dev:web`.**
:::

Open both tenants and watch the isolation — each has its own todos and its own
accent colour:

- `http://acme.localhost:47100`
- `http://globex.localhost:47100`

Browsers reject `Domain=.localhost` cookies, so in dev you sign in **per
subdomain**. On a real base domain one session spans every tenant subdomain; the
per-subdomain login is a localhost artefact, not the design.

## 5. Say hello from the CLI

The CLI is the reference client and the agent feedback loop. `--silent` keeps npm's
own chatter off stdout, so `--json` really does emit one document:

```bash
npm run --silent cli -- --json health
npm run --silent cli -- login --email demo@agentproofarch.dev --password demo1234
npm run --silent cli -- whoami
npm run --silent cli -- --tenant acme todo list
```

Human output of that flow against a fresh seed:

```text
status=ok db=up v0.1.0 sha=unknown
signed in as demo@agentproofarch.dev
demo@agentproofarch.dev @ Acme Sp. z o.o. (acme, staff: owner)
- Wdrożyć walking skeleton na produkcję  (3f8a1c02)
- Sprawdzić izolację danych między tenantami  (b17d94ee)
```

`v0.1.0` is `package.json`'s version (the single release-identity source) and
`sha=unknown` is the honest local answer — `APP_COMMIT_SHA` is only set by a
deploy, where `smoke:remote` asserts it equals the promoted commit. The trailing
parenthesis on a todo is the first 8 characters of its row id; the seed uses
`crypto.randomUUID()`, so yours will differ. Full tour:
[CLI walkthrough](../guides/cli-walkthrough.md).

## 6. Run the gates

```bash
npm run check            # static: typecheck ×2 + eslint + lock-lint + depcruise + knip + doc-lint + coverage
npm run smoke            # runtime: isolated DB, real server, CLI flow — ~5s
```

`smoke` assumes `npm run db:up` is running. It does **not** touch your dev-seeded
database: it drops and recreates `agentproofarch_smoke`, migrates and seeds that,
boots `entry.node.ts` on an ephemeral port, and drives the flow. A green run prints
these phases (the port is ephemeral and the elapsed time is measured, so both vary):

```text
smoke: checking lockfile drift...
smoke: preparing isolated database...
smoke: waiting for Mailpit...
smoke: booting server on port <ephemeral>...
smoke: driving the CLI...

smoke: PASS (5.1s)
```

The browser gate needs Chromium and a built bundle, so it is a separate command
(and a separate CI job) — run it for any `apps/web` change:

```bash
npx playwright install --with-deps chromium
npm run build:web
npm run e2e
```

:::danger Static-green is not done
**Done = `check` green AND `smoke` green.** Do not weaken a lint rule to make
either go green, and do not rerun a red job until it passes — a flake is a P1 bug
([Testing doctrine](../guides/testing-doctrine.md)).
:::

## The whole first run, in order

```mermaid
flowchart TD
  clone["git clone · cd demo"] --> install["npm ci<br/>never npm install"]
  install --> up["npm run db:up<br/>Postgres 47542 + Mailpit 47925/47980"]
  up --> migrate["npm run db:migrate"]
  migrate --> seed["npm run db:seed<br/>demo user · acme + globex"]
  seed --> choose{"What are you doing?"}
  choose -->|"frontend work"| devweb["npm run dev:web<br/>Vite on 47180"]
  choose -->|"prod-like page"| build["npm run build:web"]
  build --> devserver["npm run dev:server<br/>API + SPA on 47100"]
  choose -->|"verify a capability"| clihello["npm run --silent cli -- --json health"]
  devweb --> gates
  devserver --> gates
  clihello --> gates
  gates["npm run check<br/>npm run smoke"] --> done["Done = both green"]
```

## Ports

Nothing binds a common port, on purpose — 3000, 5432, 8080 and friends are all
avoided so the stack never collides with whatever else you are running.

| Port | Service |
|---|---|
| 47100 | API + built SPA (`dev:server`; the `PORT` default) |
| 47180 | Vite dev server (`dev:web`) |
| 47542 | Postgres 16 (`docker-compose.dev.yml`; override with `DB_PORT`) |
| 47925 | Mailpit SMTP (override with `MAILPIT_SMTP_PORT`) |
| 47980 | Mailpit web UI + HTTP API (override with `MAILPIT_API_PORT`) |
| 47101 | Self-host only: the internal domain-check control plane (`INTERNAL_PORT`, unset in dev) |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Every page fails with "response does not match the contract" | `dist/web` is a stale build and `dev:server` is serving it | `npm run build:web`, or use `dev:web` |
| `check` fails in `lock-lint` after adding a dependency | the lockfile was regenerated with a different npm major | reinstall with `npx -y npm@11 install <pkg>` and commit the regenerated lockfile |
| `smoke` fails with "Dependencies are not installed" or a lockfile-drift list | `node_modules` does not match `package-lock.json` | `npm ci` |
| Signing in on `acme.localhost` does not carry over to `globex.localhost` | browsers reject `Domain=.localhost` cookies | expected in dev — sign in per subdomain |
| Sign-in returns 403 "invalid origin" | Better Auth requires the request `Origin` to match `APP_BASE_URL`; changing the port without changing `APP_BASE_URL` breaks it | keep `APP_PORT` and `APP_BASE_URL` in step |
| `db:migrate` / `db:seed` cannot connect | the Docker stack is not up, or Postgres is still starting | `npm run db:up`, then wait for its healthcheck |
| A magic-link command "sent" a mail you cannot find | there is no dev mail transport — Mailpit captured it | open `http://localhost:47980` |
| e2e fails at startup with the port already in use | a previous harness left the port bound | the harness now frees the port before boot ([#55](https://github.com/chomamateusz/agentproofarch/pull/55)); if it recurs, that is a P1 to file, not a job to rerun |

## Next

- [CLI walkthrough](../guides/cli-walkthrough.md) — every command group with real
  output and exit codes.
- [Adding a feature](../guides/adding-a-feature.md) — the scaffolder and the
  12-step chain.
- [Layers](../architecture/layers.md) — what you just booted, structurally.
- [Environments and promotion](../operations/environments.md) — how the same
  commit reaches Vercel and a self-hosted container.
