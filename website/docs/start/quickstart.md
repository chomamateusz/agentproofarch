---
title: Quickstart
sidebar_label: 🔥 Quickstart
description: Clone the repository and get to a green runtime gate.
pagination_next: guides/cli-walkthrough
---

# Quickstart 🔥 \{#quickstart}

This page takes you from `git clone` to a green **runtime** gate — the point where
the real server has booted, the CLI has driven a full multi-tenant flow through it,
and you can trust what you are looking at. It is deliberately not a "hello world":
the same five minutes that start the dev server also seed two tenants, a demo
account and a local mail sink, because every one of those is something the gates
and the walkthroughs assume exists. Every command below is copied from
`demo/package.json` and the repository READMEs.

## The four commands ⚡ \{#the-four-commands}

After [install](#1-clone-and-install), four commands boot the working demo:

```bash
pnpm run db:up
pnpm run db:migrate
pnpm run db:seed
pnpm run dev:web
```

The numbered sections below are the same path with every prerequisite, seed
value and sharp edge annotated.

## What you get after boot 📦 \{#what-you-get-after-boot}

The demo is a **walking skeleton** — the thinnest version of the real system
with every layer connected and actually working — not a scaffold of stubs.

What walks through it, each capability flowing through *every* layer and
drivable from both the web app and the CLI:

- authentication: password, magic link, TOTP two-factor, passkeys, plus a
  Google seam that stays dormant unless both of its env vars are set — password
  and magic link from either surface; TOTP, passkeys and Google are web-only
  (browser ceremonies the CLI ships no commands for);
- foundation-owned tenants with flat `owner`/`admin` staff grants, resolved by
  custom domain or subdomain;
- end-customer members with GDPR export and removal;
- todos and two exemplar boards (a personal one and a WIP-guarded team one);
- a public unauthenticated read surface.

## Prerequisites 🧰 \{#prerequisites}

| Tool | Version | Why exactly this |
|---|---|---|
| **Node** | 24 (`.nvmrc` pins it) | `engines.node` is `24.x`; the CI runner is Node 24. |
| **[nvm](https://github.com/nvm-sh/nvm)** (or any Node version manager) | any recent | step 1 runs `nvm use` to land on Node 24 from `.nvmrc`; `fnm use`, `mise use` or a direct Node 24 install work just as well. |
| **pnpm** | `10.34.5` | `packageManager` pins the exact release; `engines.pnpm` requires pnpm 10 or newer. |
| **Docker** | any recent | `pnpm run db:up` starts Postgres 16 and Mailpit from `docker-compose.dev.yml`. |

Everything runs from `demo/` — it has its own `package.json`. The repository root
holds `docs/` (normative architecture + PRD) and `website/` (this site).

## 1. Clone and install 📥 \{#1-clone-and-install}

```bash
git clone https://github.com/chomamateusz/agentproofarch.git
cd agentproofarch/demo
nvm use
corepack enable
corepack prepare --activate
pnpm install --frozen-lockfile
```

No nvm? Substitute your manager's equivalent of `nvm use` (`fnm use`,
`mise use`), or install Node 24 directly — the pin lives in `.nvmrc`. Do **not**
ignore pnpm printing `WARN Unsupported engine: wanted: {"node":"24.x"}`: it
means the shell is still on some other Node (a failed `nvm use` does not stop a
pasted block), and everything from here on would run on an unsupported runtime.

:::warning[Keep the lock and supply-chain policy intact]
`lock-lint` proves `pnpm-lock.yaml` matches `package.json` with
`pnpm install --frozen-lockfile --lockfile-only`, the same frozen semantics used
by CI and Docker. Add dependencies with `pnpm add <pkg>` and commit the settled
lockfile. Dependency build scripts are blocked unless explicitly allowlisted in
`onlyBuiltDependencies`, and `minimumReleaseAge: 4320` keeps releases out for
three days.
:::

## 2. Environment: nothing to do (locally) ⚙️ \{#2-environment-nothing-to-do-locally}

For plain local development this step really is **nothing**: no `.env` file to
create, no variable to export — skip straight to step 3. Every key a local boot
needs has a dev default in the single env schema,
[`demo/core/server/config.ts`](https://github.com/chomamateusz/agentproofarch/blob/main/demo/core/server/config.ts):
`DATABASE_URL` defaults to
`postgresql://agentproofarch:agentproofarch@localhost:47542/agentproofarch`,
`DB_DRIVER` to `node-postgres` off Vercel, `APP_BASE_DOMAIN` to `localhost`,
`PORT` to `47100`, and `SMTP_HOST`/`SMTP_PORT` to the dev Mailpit.

The dev-only `BETTER_AUTH_SECRET` default is *refused* the moment the process
looks deployed (`VERCEL` set, or `SECURE_COOKIES=true`), so the shortcut cannot
leak into a deployment.

You create a `.env` (`cp .env.example .env`) in three cases:

1. **Docker self-host** — the compose stack reads keys the bare dev boot never
   needs (`POSTGRES_*` for the database sidecar, `APP_PORT`, a real
   `BETTER_AUTH_SECRET`, `SECURE_COOKIES=true`, …).
2. **Overriding a dev default** — for example pointing `DATABASE_URL` at a
   different Postgres, or moving a port.
3. **Turning on an optional integration that ships off** — Google sign-in
   (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), Sentry, OTel, the SES email
   transport, Vercel domain provisioning, the backfill route. Their keys have
   no dev default because absent means the feature stays dormant.

`.env.example` documents **names only**, and it is also the file `doc-lint` checks
the env schema against — a new env key missing from it fails `check`.

## 3. Database, mail sink, seed 🗄️ \{#3-database-mail-sink-seed}

```bash
pnpm run db:up            # Postgres 16 on 47542 + Mailpit on 47925 (SMTP) / 47980 (UI)
pnpm run db:migrate       # tsx adapters/db/migrate.ts — applies the drizzle migrations
pnpm run db:seed          # idempotent; running it twice is a no-op
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

## 4. Run it ▶️ \{#4-run-it}

Two dev paths, and picking the wrong one is the most common first-run
frustration. Each path answers on its own port — open the URL printed next to
the command you ran:

```bash
pnpm run dev:web          # Vite + hot reload — the canonical frontend path
                          # → open http://acme.localhost:47180
```

```bash
pnpm run build:web        # …or a prod-like page: build the SPA first,
pnpm run dev:server       # then the API + built bundle
                          # → open http://acme.localhost:47100
```

:::warning[`dev:server` serves a gitignored build]
`dev:server` serves whatever `dist/web` currently holds. After a contract change a
stale bundle fails **every** page with "response does not match the contract" (a
real incident, 2026-07-12). The server warns at boot when `dist/web` is missing or
older than the web/contract sources; on that warning either `pnpm run build:web` or
switch to `dev:web`. **All frontend work goes through `dev:web`.**
:::

Open both tenants and watch the isolation — each has its own todos and its own
accent colour:

- `http://acme.localhost:47180` and `http://globex.localhost:47180` (`dev:web`)
- `http://acme.localhost:47100` and `http://globex.localhost:47100` (`dev:server`)

Browsers reject `Domain=.localhost` cookies, so in dev you sign in **per
subdomain**. On a real base domain one session spans every tenant subdomain; the
per-subdomain login is a localhost artefact, not the design.

## 5. Say hello from the CLI ⌨️ \{#5-say-hello-from-the-cli}

The CLI is the reference client and the agent feedback loop. It talks to the API
over HTTP and defaults to `http://localhost:47100`, so **`pnpm run dev:server`
has to be running** (`dev:web` on 47180 is not it, and `smoke` boots its own
throwaway port). `--silent` keeps pnpm's own chatter off stdout, so `--json`
really does emit one document:

:::note[The CLI keeps one global profile per machine]
First time on this machine? Nothing to do — skip this.

CLI state — API URL, session token, selected tenant — lives in
`~/.config/agentproofarch/config.json`, keyed off the home directory, so it
survives across clones **and** deployments. If this machine ever pointed the
CLI at another instance, the block below talks to *that* API, not your local
server. The one-line fix: add the global `--api-url http://localhost:47100`
flag to the `health` and `login` lines below — the URL persists for every
command after it.

<details>
<summary>Alternative: a fully clean throwaway profile</summary>

Run the whole block in a throwaway shell whose home is a fresh directory —
`export HOME="$(mktemp -d)"` first, in that shell only. The CLI then starts
from an empty profile and nothing it writes survives the shell.

</details>
:::

```bash
pnpm --silent run cli --json health
pnpm --silent run cli login --email demo@agentproofarch.dev --password demo1234
pnpm --silent run cli whoami
pnpm --silent run cli tenant switch acme
pnpm --silent run cli whoami
pnpm --silent run cli todo list
```

The first command is machine-readable and prints one JSON envelope:

```json
{
  "ok": true,
  "data": {
    "version": "0.1.0",
    "sha": "unknown",
    "status": "ok",
    "database": "up"
  }
}
```

The remaining commands use human output. A fresh CLI has no selected tenant until
`tenant switch acme` persists one:

```text
signed in as demo@agentproofarch.dev
demo@agentproofarch.dev (no tenant selected)
active tenant: Acme Sp. z o.o. (acme)
demo@agentproofarch.dev @ Acme Sp. z o.o. (acme, staff: owner)
- Wdrożyć walking skeleton na produkcję  (todo-wal)
- Sprawdzić izolację danych między tenantami  (todo-ten)
```

`v0.1.0` is `package.json`'s version (the single release-identity source) and
`sha=unknown` is the honest local answer — `APP_COMMIT_SHA` is only set by a
deploy, where `smoke:remote` asserts it equals the promoted commit. The trailing
parenthesis on a todo is the first 8 characters of its stable seed row id. Full tour:
[CLI walkthrough](../guides/cli-walkthrough.md).

## 6. Run the gates 🛡️ \{#6-run-the-gates}

```bash
pnpm run check            # static: typecheck ×2 + eslint + lock-lint + depcruise + knip + doc-lint + coverage
pnpm run smoke            # runtime: isolated DB, real server, CLI flow — seconds warm, ~20-30s first run
pnpm run quickstart:probe # fresh-state promises: repeat seed, two clones, CLI hello
```

`smoke` assumes `pnpm run db:up` is running. It does **not** touch your dev-seeded
database: it drops and recreates `agentproofarch_smoke`, migrates and seeds that,
boots `entry.node.ts` on an ephemeral port, and drives the flow. A green run prints
these phases (the port is ephemeral and the elapsed time is measured, so both vary —
a warm machine lands around 5s, a first run closer to 20-30s):

```text
smoke: checking lockfile drift...
smoke: preparing isolated database...
smoke: waiting for Mailpit...
smoke: booting server on port <ephemeral>...
smoke: driving the CLI...

smoke: PASS (5.1s)
```

`quickstart:probe` is this page's own gate. Like `smoke` it assumes `pnpm run
db:up` and stays off your dev data (its throwaway database is
`agentproofarch_quickstart`), so it reproduces a fresh-clone volume. What it
asserts, exactly: the per-table row counts behind the seed table above (1 user,
2 tenants, 2 staff grants, 2 domains, 3 members, 3 todos); the seed table's
cheap specifics — the three member emails with their tenants, alice's
`vip`/`early-adopter` tags, mag's not-yet-bound account, the demo user's
owner-in-acme / admin-in-globex grants, and the `acme.localhost` /
`globex.localhost` domain rows; that seeding again changes no row count; that a
copy of the checkout under a different directory name still resolves the shared
`agentproofarch-dev` Compose project and re-seeds to the same counts; and that
a freshly booted server answers step 5's CLI block line for line. It does not
diff full rows beyond those fields, and it does not replay steps 1–4.

The browser gate needs Chromium and a built bundle, so it is a separate command
(and a separate CI job) — run it for any `apps/web` change:

```bash
pnpm exec playwright install --with-deps chromium
pnpm run build:web
pnpm run e2e
```

:::danger[Static-green is not done]
**Done = `check` green AND `smoke` green.** Do not weaken a lint rule to make
either go green, and do not rerun a red job until it passes — a flake is a P1 bug
([Testing doctrine](../guides/testing-doctrine.md)).
:::

## The whole first run, in order 🗺️ \{#the-whole-first-run-in-order}

```mermaid
flowchart TD
  clone["git clone · cd demo"] --> install["corepack prepare --activate<br/>pnpm install --frozen-lockfile"]
  install --> up["pnpm run db:up<br/>Postgres 47542 + Mailpit 47925/47980"]
  up --> migrate["pnpm run db:migrate"]
  migrate --> seed["pnpm run db:seed<br/>demo user · acme + globex"]
  seed --> choose{"What are you doing?"}
  choose -->|"frontend work"| devweb["pnpm run dev:web<br/>Vite on 47180"]
  choose -->|"prod-like page"| build["pnpm run build:web"]
  build --> devserver["pnpm run dev:server<br/>API + SPA on 47100"]
  choose -->|"verify a capability"| cliserver["pnpm run dev:server<br/>API on 47100"]
  cliserver --> clihello["pnpm --silent run cli --json health<br/>login · tenant switch acme · whoami · todo list"]
  devweb --> gates
  devserver --> gates
  clihello --> gates
  gates["pnpm run check<br/>pnpm run smoke"] --> done["Done = both green"]
```

## Troubleshooting 🚨 \{#troubleshooting}

The five failures people actually hit on a first boot. The longer tail — old
checkouts, shared Docker stacks, stale volumes, origin mismatches — has its own
page: [Troubleshooting first run](./troubleshooting.md).

| Symptom | Cause | Fix |
|---|---|---|
| Every page fails with "response does not match the contract" | `dist/web` is a stale build and `dev:server` is serving it | `pnpm run build:web`, or use `dev:web` |
| `db:migrate` / `db:seed` cannot connect | the Docker stack is not up, or Postgres is still starting | `pnpm run db:up`, then wait for its healthcheck |
| `smoke` fails with "Dependencies are not installed" or a lockfile-drift list | `node_modules` does not match `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` |
| Signing in on `acme.localhost` does not carry over to `globex.localhost` | browsers reject `Domain=.localhost` cookies | expected in dev — sign in per subdomain |
| A magic-link command "sent" a mail you cannot find | there is no dev mail transport — Mailpit captured it | open `http://localhost:47980` |

<details>
<summary>Ports — the full map</summary>

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

</details>

## Next ➡️ \{#next}

**Next: the [CLI walkthrough](../guides/cli-walkthrough.md)** — the loop you just
said hello to, in full: the envelope, the exit codes, and how an agent scripts it.

Or, depending on what you are doing:
[Adding a feature](../guides/adding-a-feature.md) (the scaffolder and the 12-step
chain) · [Layers](../architecture/layers.md) (what you just booted, structurally) ·
[Environments and promotion](../operations/environments.md) (how the same commit
reaches Vercel and a container) · [glossary](./glossary.md) (every term this site
uses).
