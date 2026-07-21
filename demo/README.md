# agentproofarch

Agent-first, strictly layered full-stack TypeScript foundation for multi-tenant SaaS.
The architecture is defined in [../docs/architecture.md](../docs/architecture.md)
(and distilled from [../docs/prd-agentproofarch-foundation.md](../docs/prd-agentproofarch-foundation.md));
this repo is the **walking skeleton**: auth, foundation-owned tenants (flat
`owner`/`admin` grants — no organizations/teams concept), tenant resolution by
domain, one tasks subdomain — todos plus the two exemplar boards (personal +
team) — flowing through every layer, a full CLI and a web SPA. Live at
<https://agentproofarch.vercel.app> (`demo@agentproofarch.dev` / `demo1234`).

New here? Read [../docs/first-feature.md](../docs/first-feature.md) — it adds a
real resource end-to-end in 30 minutes.

## Quickstart (local demo)

```bash
npm ci               # NOT npm install (see "The two gates")
npm run db:up        # Postgres 16 in Docker on port 47542
npm run db:migrate
npm run db:seed      # demo user + two tenants + todos
npm run dev:web      # frontend: Vite + hot reload on 47180 — the canonical dev path
```

`dev:web` is where **all frontend work** happens. For a prod-like page (the
server serving a built bundle instead of the Vite dev server):

```bash
npm run build:web
npm run dev:server   # API + built SPA on http://acme.localhost:47100
```

Open **http://acme.localhost:47100** and **http://globex.localhost:47100** —
sign in as `demo@agentproofarch.dev` / `demo1234`. Each tenant domain shows its
own isolated todos (and its own accent color). Note: on `localhost` browsers
reject cross-subdomain cookies, so you sign in per tenant domain; on a real
base domain one session spans all tenant subdomains. `dev:server` serves
whatever `dist/web` holds (a gitignored build) — after a contract change an
old bundle fails every page, so rebuild or use `dev:web`.

## CLI — the agent feedback loop

```bash
npm run --silent cli -- register --name Demo --email demo@agentproofarch.dev --password demo1234
npm run --silent cli -- login --email demo@agentproofarch.dev --password demo1234
npm run --silent cli -- tenant list
npm run --silent cli -- tenant switch acme
npm run --silent cli -- todo list
npm run --silent cli -- --tenant globex todo add Something for Globex
npm run --silent cli -- card list --board team           # team board cards
npm run --silent cli -- card add Ship it --board team --column todo
npm run --silent cli -- card move <id> --board team --to in-dev
npm run --silent cli -- --json whoami        # single JSON document on stdout
npm run --silent cli -- logout                           # drops the stored token
```

Full command set: `health`, `register`, `login`, `logout`, `whoami`,
`tenant list|create|switch`, `todo list|add`, `card list|add|move`.

Every command supports `--json` and exits with a code mapped from the error
taxonomy (`validation`=2, `unauthorized`=3, `forbidden`=4, `not_found`=5,
`conflict`=6, `tenant_not_found`=7, `internal`=10). That makes the CLI a
deterministic verification loop for AI agents — and the reference client.

## Architecture in one screen

```
core/domain     entities, Result, error taxonomy          → zod only
core/contract   API routes + schemas (single source)      → domain
core/server     use-cases + ports (interfaces)            → domain
core/client     typed HTTP client + query definitions     → contract
adapters/db     Drizzle repos, driver factory (pg|neon)   → implements ports
adapters/auth   Better Auth (server + client adapter)     → implements ports
apps/server     Hono wiring + composition root            → the only place server adapters are instantiated
apps/web        React SPA (Vite, TanStack Router/Query)   → core/client only
apps/cli        commander commands                        → core/client only
```

`composition.ts` is the only place a *server* adapter is instantiated. Two
deliberate exceptions: the auth *client* adapter is constructed in
`apps/web/src/api.ts` (web) and the CLI's `cliCtx`, and `adapters/db/migrate.ts`
reads `DB_DRIVER`/`DATABASE_URL`/`VERCEL` itself as a sanctioned composition
point outside the server root.

Rules are **machine-enforced**: `eslint-plugin-boundaries` + `dependency-cruiser`
fail the build on any cross-layer import, on `@vercel/*`/`@neondatabase/*`
outside `adapters/`, and on any framework import inside `core/`. `any` and
type assertions (`as`, except `as const`) are lint errors.

## The two gates

```bash
npm run check   # static gate: typecheck + lint + lock-lint + depcruise + knip + doc-lint + coverage
npm run smoke   # runtime gate: real server boots, CLI drives the full flow (~5s)
```

- **`check`** runs typecheck, ESLint (layer boundaries), `lock-lint`
  (validates `package-lock.json` under npm-10 semantics — the exact rules
  `npm ci` enforces on CI; a local npm 11 `npm install` silently prunes
  optional entries and broke CI twice, so **never `npm install` here** — add
  deps with `npx -y npm@10 install`), dependency-cruiser, `knip`
  (dead files + dependency hygiene), `doc-lint`
  (docs ↔ enforcer-config, injected counts, env-schema ↔ `.env.example`, dead
  links), and vitest with coverage across
  **<!--count:test-files-->59<!--/count--> test files**; coverage thresholds are
  a ratchet floor, so a regression fails the gate.
- **`smoke`** recreates an isolated `agentproofarch_smoke` database, boots the
  real server (`entry.node.ts`) and drives health → sign-in → todos →
  unauthorized through the CLI, asserting taxonomy exit codes. **Done =
  `check` green AND `smoke` green.** Static-green is not done.

Two more levels, their own CI jobs (browser + Postgres, kept out of `check`) —
<!--count:integration-tests-->30<!--/count--> integration tests against a real
Postgres and <!--count:e2e-tests-->9<!--/count--> Playwright tests across
<!--count:e2e-specs-->3<!--/count--> spec files:

```bash
npm run test:integration   # repositories, against a real Postgres
npm run e2e                # real Chromium over the real stack
```

<!--count:config-regression-->34<!--/count--> config-regression probes guard the
covered boundary and island-core rules — most feed a violating fixture and
assert the gate still goes red, a few are structural rule-presence checks rather
than fixture-feeding probes — so you can't silently delete one of those rules and
stay green ([ADR-0004](../docs/decisions/0004-no-exceptions-enforcement.md)).

## Adding a resource

Start with the scaffolder — the canonical entry point:

```bash
npm run new:resource -- <singular-name>    # e.g. note, blog-post
```

It generates the files a resource owns (domain type, use-cases + test,
repository, web page + route) and prints an ordered checklist for the shared
files you wire by hand, each with its anchor line and a paste-ready snippet. It
does **not** edit shared files: the generated code imports symbols that don't
exist yet, so `npm run check` stays RED through the type-forced steps (domain,
contract, port/use-case, client wiring). Three steps — the CLI command,
server-route registration, and the web route — typecheck fine while unwired, so
for those the checklist, not the compiler, enforces completion. Full narrated
walkthrough:
[../docs/first-feature.md](../docs/first-feature.md).

Its client-state sibling scaffolds a feature (island) with a rung-1 island
core — the events-in / selectors-out seam of
[ADR-0005](../docs/decisions/0005-client-application-state.md):

```bash
npm run new:island -- <name>               # e.g. personal-board
```

## Tenant resolution

Per request: (1) exact custom-domain match in `tenant_domains`,
(2) subdomain of `APP_BASE_DOMAIN` (subdomain = tenant slug),
(3) `X-Tenant` header (CLI). Membership is verified in every case; every
tenant-scoped use-case takes `ctx.identity` and every repository call requires
`tenantId`.

## Deployment targets

Same commit, env only — live on Vercel today
([ADR-0003](../docs/decisions/0003-vercel-environments.md)):

| | Vercel | Docker self-host |
|---|---|---|
| API | Hono handler as a function (`api/index.ts` via `@hono/node-server/vercel`) | Node container (`entry.node.ts`) |
| DB | Neon, `DB_DRIVER=neon-http` | `postgres:16`, `DB_DRIVER=node-postgres` |
| Web | static build | served by the same Node process |

Production = `main` → <https://agentproofarch.vercel.app>; staging is a
long-lived branch; every PR gets a preview on an ephemeral Neon branch; each
deploy is re-verified by `smoke:remote` in `post-deploy-smoke`. Web is
single-tenant on `*.vercel.app` until a wildcard domain is attached (env, not
code); API/CLI stay multi-tenant via `X-Tenant`.

The Docker self-host target is **built** (US-021 + US-022, DECIDE A2): a
multi-stage `Dockerfile` (SPA + tsc-compiled server, prod-only deps, non-root,
`HEALTHCHECK`), `docker-compose.prod.yml` (`postgres:16` + app + an
`edge`-profiled Caddy for on-demand TLS) and `docker-entrypoint.sh` (runs
migrations on startup). A dedicated CI job (`selfhost.yml`) builds the image,
boots the stack and runs the smoke CLI against the container on every push. The
one piece still deferred is the **Vercel** Domains API adapter (US-020, folded
into the A1 custom-domains slice) — self-host issues TLS via Caddy and needs no
such adapter.

### Self-host with Docker

```bash
cp .env.example .env     # set BETTER_AUTH_SECRET; for real TLS also set APP_BASE_URL
                         # (https), APP_BASE_DOMAIN and SECURE_COOKIES=true
docker compose -f docker-compose.prod.yml up -d --build
#  -> postgres + app; the entrypoint migrates on startup, then serves API + SPA
#     on http://localhost:47100. Add SEED_ON_START=true to .env for demo data.
```

Add the Caddy edge (on-demand TLS terminator, binds 80/443, needs `Caddyfile`)
for a real domain:

```bash
docker compose -f docker-compose.prod.yml --profile edge up -d --build
```
