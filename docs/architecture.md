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

Dependency-free is not the goal; replaceability is. Core bans *infrastructure*
(frameworks, servers, drivers — anything with a plausible second implementation
or platform difference), which lives behind ports. *Vocabulary* libraries
(zod, `@tanstack/query-core`) are ordinary imports on the per-layer allowlist
above — they are practically language extensions, and swapping one would be a
rewrite regardless of any abstraction. Never wrap a vocabulary library in a
port — an interface with exactly one implementation forever is **port
theater**: it re-states the library's API without buying replaceability (a
`QueryPort` over TanStack Query would re-type `status`/`fetchStatus`,
invalidation and optimistic-update semantics, and still not survive an engine
swap). Extend the allowlist deliberately instead.

For genuinely complex clients (realtime push sync, event sourcing, heavy
concurrency) a richer vocabulary such as Effect is a legitimate choice in this
same slot — t3code builds its entire framework-free client core on it. It is a
foundation decision, never an incremental one: it replaces zod + query-core
wholesale, brings its own idiom, and needs its own guardrails (t3code vendors
the Effect sources with `LLMS.md` for agents and gates PRs with an AI reviewer
for idiomatic usage). Default remains zod + `@tanstack/query-core`.

## Frontend (apps/web)

The SPA is a thin client: domain logic lives in `core`, the web app renders
server state and collects input. Inner structure is enforced the same way as
the layers — boundaries + lint, not convention (see
[frontend-lint-plan.md](frontend-lint-plan.md); rationale in
[frontend-comparison.md](frontend-comparison.md)).

```
apps/web/src/
  main.tsx          composition root: providers + router wiring only
  api.ts            binds core/client action factories once — the only module
                    that sees ApiClient, AuthClientPort and adapters
  routes/           route components — thin: parse params, render a feature
  features/<name>/  feature folders: components, hooks, <Name>.logic.ts co-located
  components/ui/    design-system primitives → theme, lib only (no core, no features)
  lib/              pure TS utilities → no react
  theme.ts          the entire visual language (MUI theme); no colors/fonts elsewhere
```

State rules:

- **Server state**: TanStack Query only, consuming **bound actions** —
  `core/client` exports query/mutation factories (including auth actions over
  `AuthClientPort`), `api.ts` binds them once, and features import ready
  actions. Feature code never holds `ApiClient`, a port or an adapter, never
  defines `queryKey`/`queryFn` inline and never touches `fetch` (all lint).
  The descriptor object is the seam — TanStack is a vocabulary dependency,
  never wrapped in a port; full usage policy in
  [server-state.md](server-state.md).
- **Client state**: `useState`/`useReducer` local to the feature; React context
  only for cross-cutting concerns (theme, session). No global state libraries
  (lint).
- **URL state**: path params = resource identity, search params = shareable
  filters; neither is duplicated into component state.

The action set is CQRS-partitioned: every action is either a query (safe
read) or a command (unsafe write) — no hybrids, enforced by read/write tags
flowing from contract route methods through the client types. All client
interfaces (web, CLI, future) consume the same partition.

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

Authentication is separated from relationship
([ADR-0002](decisions/0002-member-identity-and-idp.md)): one global account
per email holds *authentication only* (passwordless + magic link allowed)
behind a narrow, OIDC-shaped `AuthPort` — the provider (Better Auth default)
is swappable by design, and its topology (embedded / separate container /
SaaS) is a composition-root choice. Two populations on top of it:

- **Tenant staff** — our `tenant_admins` aggregate: flat `owner | admin`
  grants, deliberately no teams/organizations concept (multiple admins are
  just multiple rows).
- **End customers ("members")** — our own tenant-scoped aggregate (profile,
  tags, GDPR consents, owned email snapshot, export).

Product-required auth methods — magic link, social login, passkeys, 2FA —
are provider features exposed only through `AuthClientPort` and required
from the proof of concept onwards. `userId` is an opaque string: foundation
tables never FK provider tables.

No auth-provider organization/team feature is used for either population —
the provider supplies identity only (`userId`, email, name, verification
status) and `tenants` is a foundation entity, never a provider object.
Provider org APIs let users list their organizations (would leak a
customer's other tenants), provider-attached relationship data would turn an
IdP swap into a data migration, and tenant creation must not depend on the
auth provider.

Tenant resolution per request: custom domain (from `tenant_domains`) →
subdomain of `APP_BASE_DOMAIN` (slug) → `X-Tenant` header (CLI); membership is
always verified. Every tenant-scoped use-case takes `ctx: { identity }` first
and every tenant-scoped repository call requires `tenantId`. Sessions span
`APP_BASE_DOMAIN` subdomains; each custom domain is its own cookie world
(sign-in per domain — deliberate isolation).

**Tenant, not instance**: one instance (one DB) hosts many tenants over one
shared account pool — a creator's unrelated brands should be tenants, not new
deployments. Cross-instance/cross-app SSO is an evolution path (central OIDC
IdP via an `AuthPort` adapter swap), not a foundation feature.

## Public surface

Products on this foundation ship no public marketing pages — creators bring
their own sites ([ADR-0001](decisions/0001-public-surface-embeds-over-pages.md)).
The platform owns the commerce layer and exposes it as: public read-only
contract routes (unauthenticated GET, open CORS, cache keyed to tenant content
version), shareable flow URLs on tenant domains (checkout without any
creator-hosted page), post-MVP iframe embed widgets (`/embed/*`, Hono +
`hono/jsx` typed templates — plain HTML, no client runtime), and a recommended
(pending confirmation) headless React SDK reusing `core/contract` types. The
authenticated app remains a static SPA.

## Ports (complete list)

- `AuthPort` (server): request headers → authenticated user. Better Auth.
- `AuthClientPort` (client): sign-up/in/out + magic link. Better Auth client.
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

Vercel is the default because it is the simplest for most applications — the
same reasoning that makes TanStack Query the default over Effect. It is
invocation-only: no resident process, so no queue workers, schedulers,
websockets or long-running jobs. The Docker image is the full-runtime escape
hatch from the same commit and runs anywhere (VPS, Railway, Fly.io,
Kubernetes); anything that needs a resident process lives on that target. When
background jobs become real, add a `JobsPort` (same pattern as `DomainPort`):
pg-boss on the existing Postgres for Docker, a cron/queue-service adapter for
Vercel.
