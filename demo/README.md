# agentproofarch

Agent-first, strictly layered full-stack TypeScript foundation for multi-tenant SaaS.
The architecture is defined in [../docs/prd-agentproofarch-foundation.md](../docs/prd-agentproofarch-foundation.md);
this repo currently contains the **walking skeleton**: auth, organizations (tenants),
tenant resolution by domain, one demo resource (todos) flowing through every layer,
a full CLI and a web SPA.

## Quickstart (local demo)

```bash
npm install
npm run db:up        # Postgres 16 in Docker on port 47542
npm run db:migrate
npm run db:seed      # demo user + two tenants + todos
npm run build:web
npm run dev:server   # API + SPA on http://localhost:47100
```

Open **http://acme.localhost:47100** and **http://globex.localhost:47100** —
sign in as `demo@agentproofarch.dev` / `demo1234`. Each tenant domain shows its
own isolated todos (and its own accent color). Note: on `localhost` browsers
reject cross-subdomain cookies, so you sign in per tenant domain; on a real
base domain one session spans all tenant subdomains.

## CLI — the agent feedback loop

```bash
npm run --silent cli -- login --email demo@agentproofarch.dev --password demo1234
npm run --silent cli -- org list
npm run --silent cli -- org switch acme
npm run --silent cli -- todo list
npm run --silent cli -- --tenant globex todo add Something for Globex
npm run --silent cli -- --json whoami        # single JSON document on stdout
```

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
apps/server     Hono wiring + composition root            → the only place adapters are instantiated
apps/web        React SPA (Vite, TanStack Router/Query)   → core/client only
apps/cli        commander commands                        → core/client only
```

Rules are **machine-enforced**: `eslint-plugin-boundaries` + `dependency-cruiser`
fail the build on any cross-layer import, on `@vercel/*`/`@neondatabase/*`
outside `adapters/`, and on any framework import inside `core/`. `any` and
type assertions (`as`, except `as const`) are lint errors.

```bash
npm run check   # typecheck + lint + dependency graph + tests — the single gate
```

## Tenant resolution

Per request: (1) exact custom-domain match in `tenant_domains`,
(2) subdomain of `APP_BASE_DOMAIN` (subdomain = org slug),
(3) `X-Tenant` header (CLI). Membership is verified in every case; every
tenant-scoped use-case takes `ctx.identity` and every repository call requires
`tenantId`.

## Deployment targets

Same commit, env only:

| | Vercel | Docker self-host |
|---|---|---|
| API | Hono handler as function (`entry.vercel.ts` — TODO) | Node container (`entry.node.ts`) |
| DB | Neon, `DB_DRIVER=neon-http` | `postgres:16`, `DB_DRIVER=node-postgres` |
| Web | static build | served by the same Node process |

The full production Docker/Caddy + Vercel deployment stories are US-020…US-023
in the PRD and intentionally not built yet.
