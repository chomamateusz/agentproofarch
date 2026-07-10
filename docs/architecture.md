# Architecture

Normative reference for agentproofarch. The [PRD](prd-agentproofarch-foundation.md)
§3 is the original source; this document is its distilled, implementation-facing
form. The `demo/` folder implements it.

## Principles

- **Agent-first**: the primary feedback loop is the CLI — every API capability
  has a command with `--json` (one JSON envelope on stdout) and an exit code
  mapped from the error taxonomy. An agent can implement, run and verify
  features without a browser.
- **Pure core, thin edges**: business logic lives in framework-free TypeScript;
  HTTP servers, databases, auth providers and platforms are replaceable
  adapters behind ports.
- **Machine-enforced boundaries**: layer rules are lint rules
  (eslint-plugin-boundaries + dependency-cruiser), not conventions. `npm run
  check` is the single gate.
- **Two first-class deploy targets** from the same commit: Vercel (serverless +
  Neon) and Docker self-host (Node + Postgres + Caddy). Platform names may
  appear only in `adapters/` and platform entry files.

## Layers

```
core/domain     entities, Result, error taxonomy, zod schemas   → zod only
core/contract   API routes + I/O schemas + error envelope       → domain
core/server     use-cases + ports (interfaces)                  → domain
core/client     typed HTTP client + query definitions           → contract
adapters/*      implement ports (db, auth, domain provisioning) → core
apps/server     HTTP wiring + composition root                  → everything server-side
apps/web        SPA (no SSR)                                    → core/client (+ auth client adapter)
apps/cli        commands                                        → core/client
```

Dependency rules (enforced):

- `core/**` never imports frameworks, servers or drivers (react, hono,
  drizzle, better-auth, pg, commander).
- `core/contract` is the only bridge between server and clients; clients never
  import `core/server` or `adapters/db`.
- Adapters are instantiated exclusively in the composition root
  (`apps/server/src/composition.ts`), where env decides implementations
  (`DB_DRIVER`, `DOMAIN_PROVISIONER`).
- `@vercel/*` and `@neondatabase/*` are importable only inside `adapters/`
  (and `entry.vercel.ts`).
- No `any`, no `as` (except `as const`), zod-parse at every boundary.

## Frontend (apps/web)

The SPA is a thin client: domain logic lives in `core`, the web app renders
server state and collects input. Inner structure is enforced the same way as
the layers — boundaries + lint, not convention (see
[frontend-lint-plan.md](frontend-lint-plan.md); rationale in
[frontend-comparison.md](frontend-comparison.md)).

```
apps/web/src/
  main.tsx          composition root: providers + router wiring only
  routes/           route components — thin: parse params, render a feature
  features/<name>/  feature folders: components, hooks, <Name>.logic.ts co-located
  components/ui/    design-system primitives → theme, lib only (no core, no features)
  lib/              pure TS utilities → no react
  theme.ts          the entire visual language (MUI theme); no colors/fonts elsewhere
```

State rules:

- **Server state**: TanStack Query only, consuming descriptors from
  `core/client/queries.ts`. Components never define `queryKey`/`queryFn`
  inline and never touch `fetch` (lint).
- **Client state**: `useState`/`useReducer` local to the feature; React context
  only for cross-cutting concerns (theme, session). No global state libraries
  (lint).
- **URL state**: path params = resource identity, search params = shareable
  filters; neither is duplicated into component state.

Mutations invalidate hierarchical query keys; manual cache writes only for a
single resource with rollback. Errors surface as `ApiError` carrying the
`AppError` taxonomy — rendered, never re-mapped ad hoc; a root error boundary
is mandatory. Non-trivial behavior is extracted to `*.logic.ts` and unit-tested
without rendering; component tests use real providers + MSW, never hook mocks.
React correctness (`react-hooks`, compiler, a11y, query plugins) runs at error
level in the same `npm run check` gate.

## Errors

Use-cases return `Result<T, AppError>`; nothing throws across a boundary.
`ErrorCode` is a closed union; the contract maps it exhaustively to HTTP
statuses and the CLI maps it to exit codes (`validation`=2, `unauthorized`=3,
`forbidden`=4, `not_found`=5, `conflict`=6, `tenant_not_found`=7,
`internal`=10). HTTP envelope: `{ ok: true, data } | { ok: false, error }`.

## Identity and multi-tenancy

One global account per email; membership links users to tenants
(organizations) with roles `owner | admin | member`. Tenant resolution per
request: custom domain (from `tenant_domains`) → subdomain of
`APP_BASE_DOMAIN` (slug) → `X-Tenant` header (CLI); membership is always
verified. Every tenant-scoped use-case takes `ctx: { identity }` first and
every tenant-scoped repository call requires `tenantId`.

## Ports (complete list)

- `AuthPort` (server): request headers → authenticated user. Better Auth.
- `AuthClientPort` (client): sign-up/in/out. Better Auth client.
- `DomainPort`: add/check/remove tenant domains. Implementations: Vercel
  Domains API, Caddy on-demand TLS, noop (dev).
- Repository interfaces per aggregate (todos, tenant domains, memberships).

Add a port only when a second implementation or a platform difference actually
exists.

## Deployment matrix

| | Vercel | Docker self-host |
|---|---|---|
| API | Hono handler as a function | same Hono app in a Node container |
| DB | Neon, `DB_DRIVER=neon-http` | `postgres:16`, `DB_DRIVER=node-postgres` |
| Web | static SPA build | served by the same Node process |
| TLS for tenant domains | Vercel Domains API | Caddy `on_demand_tls` + domain-check endpoint |
