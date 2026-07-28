---
title: Glossary
sidebar_label: 📖 Glossary
description: The words this architecture uses precisely — including the two that are deliberately not synonyms.
---

# Glossary 📖 \{#glossary}

*Read this if a word on this site was used before you met it — and read the first section even if not.*

## The architecture, in plain words 🏛️ \{#the-architecture-in-plain-words}

A pure-TypeScript core in four layers, one line each:

- **`core/domain`** — entities and business rules. Home of **`Result`** (a
  return value that is explicitly success *or* a typed error — domain failures
  are returned, never thrown) and the **error taxonomy** (one closed list of
  error codes, mapped to HTTP statuses and CLI exit codes). Depends on zod
  alone.
- **`core/contract`** — API routes plus zod schemas: the **seam** the server
  and every client agree on for everything the application owns. One carve-out:
  authentication flows ride Better Auth's own `/api/auth/*` routes, spoken to
  only through the auth adapters, not through `API_ROUTES`.
- **`core/server`** — use-cases plus **ports**, the interfaces the core needs
  from the outside world (database, auth, email).
- **`core/client`** — the **typed HTTP client**: it calls the contract routes
  with request and response types checked at compile time.

Around the core sit thin **adapters** implementing the ports (Drizzle database,
Better Auth, email, domain provisioning) and thin apps (a Hono HTTP server, a
React SPA, a commander CLI).

`core/**` may not import hono, react, drizzle, better-auth, pg or commander;
`core/domain` depends on zod alone. A *server* adapter is instantiated in
exactly one place — `apps/server/src/composition.ts`, the **composition root**.
None of that is a convention you are asked to remember: it is
`eslint-plugin-boundaries` plus dependency-cruiser, and violating it fails the
build.

The rest of this page pins that vocabulary down, term by term. Two words are
routinely used as synonyms elsewhere and are **deliberately not**
synonyms here: *domain* and *feature*. Getting those two right explains why `core/domain` is singular while
`features/` is plural, and why one business subdomain can have three islands over
it. Each entry says what the word means *in this repo*, and where the thing
it names actually lives.

The normative wording is
[`docs/architecture.md` §Vocabulary](https://github.com/chomamateusz/agentproofarch/blob/main/docs/architecture.md).

### Start with these ten 🔟 \{#start-with-these-ten}

The page below has over a hundred entries. Ten of them carry most of the site;
the rest can wait until you meet them.

| Term | In one line | Section |
|---|---|---|
| **`Result`** | a return value that is explicitly success *or* a typed error | [Errors and the contract](#errors-and-the-contract) |
| **Error taxonomy** | the one closed list of error codes, mapped to HTTP statuses and CLI exit codes | [Errors and the contract](#errors-and-the-contract) |
| **Port** | an interface in the core naming a capability it needs from outside | [Structure and layers](#structure-and-layers) |
| **Adapter** | the replaceable implementation of a port | [Structure and layers](#structure-and-layers) |
| **Seam** | a declared boundary two sides agree on — here, the contract seam and the island seam | [Structure and layers](#structure-and-layers) |
| **Island** | a frontend feature that no other feature may import | [Client state](#client-state) |
| **Gate** | a red-or-green mechanical check | [Gates, verification and doctrine](#gates-verification-and-doctrine) |
| **`check` / `smoke`** | the static gate and the runtime gate; both green is "done" | [Gates, verification and doctrine](#gates-verification-and-doctrine) |
| **Tenant** | one customer organisation on a shared instance | [Identity and authorization](#identity-and-authorization) |
| **Principal** | what an identity *acts as* for a decision: owner, admin, member, visitor | [Identity and authorization](#identity-and-authorization) |

## Structure and layers 🧱 \{#structure-and-layers}

| Term | Meaning |
|---|---|
| **Domain (business subdomain)** | A business subdomain of the product — "tasks", "billing". Its frontend incarnation is a feature; one subdomain may have **several** islands (a list and a board over the same tasks are two islands over one subdomain). |
| **`core/domain`** | The shared language layer: entities, zod schemas, domain rules, the error taxonomy. Pure, isomorphic, and there is exactly **one** — it is the "domain" of hexagonal / ports-and-adapters, the vocabulary every vertical slice speaks. Depends on `zod` and nothing else. |
| **`core/contract`** | The API description shared by server and every client: routes with their methods and paths, I/O zod schemas, the response envelope. The **only** bridge between server and clients. |
| **`core/server`** | Use-cases plus the port interfaces they depend on. Framework-free. |
| **`core/client`** | The typed HTTP client and the query/mutation descriptor factories. Framework-free — it knows `@tanstack/query-core`, never React. |
| **Port** | A plain TypeScript `interface` in `core/server` (or `core/client`, for `AuthClientPort`) that names a capability the core needs. No decorators, no container. |
| **Adapter** | An implementation of a port, in `adapters/*`. Points *inward*: it imports the port, never the reverse. |
| **Seam** | A declared boundary two sides agree on, so one side can be replaced or tested without the other. The term comes from Michael Feathers' *Working Effectively with Legacy Code*. This site names **two** of them, and always qualifies which: the **contract seam** (`core/contract` — what the server and every client agree on) and the **island seam** (a feature core's events in, selectors out). A bare "seam" in the opening framing means the general idea. |
| **Composition root** | `apps/server/src/composition.ts` — the one place env decides which adapters run. Two sanctioned exceptions: the auth *client* adapter (bound in `apps/web/src/api.ts` and the CLI context) and `adapters/db/migrate.ts`. |
| **Platform entry** | `api/index.ts` — the Vercel serverless entry, allowed to import `apps/server` and nothing else. Where vendor env names such as `VERCEL_GIT_COMMIT_SHA` are mapped to neutral ones. |
| **Vocabulary library** | A dependency that is practically a language extension and would be a rewrite to swap: `zod`, `@tanstack/query-core`, the `@opentelemetry/api` no-op facade. Imported directly, on a per-layer allow-list. |
| **Infrastructure** | Anything with a plausible second implementation or a platform difference — frameworks, servers, drivers, providers. Lives behind a port, never in core. |
| **Port theater** | Wrapping a vocabulary library in an interface that will only ever have one implementation. Named examples deliberately *not* built: a `QueryPort` over TanStack Query, an `IStore` over the island-store library, a Sentry port. |

See [Layers](../architecture/layers.md) and
[Ports & adapters](../architecture/ports-and-adapters.md).

## Client state 🏝️ \{#client-state}

| Term | Meaning |
|---|---|
| **Feature (island)** | `apps/web/src/features/<name>/` — the vertical slice of a subdomain in the UI. Only `features/` folders exist in the code; *island* is not a second thing but the same feature seen from its isolation guarantee: lint forbids features to import each other. |
| **View** | A React component inside a feature; renders UI and talks exclusively to its **own** island's core. |
| **Island core** | `features/<name>/core/` — a pure TS module: events in, selectors out, machine inside. A factory over its dependencies, DOM-free, node-runnable. |
| **Island seam** (= the module's boundary) | The island core's public API: `send(event)` in, `subscribe(listener)` for change notification, selectors out. Identical on every rung. It is one of the two seams named in [Structure and layers](#structure-and-layers) — the other is the contract seam. |
| **Machine** | The state implementation *inside* an island core, on a three-rung ladder. Never exported, so a view cannot type against it. |
| **Rung** (= a level on the state-management ladder) | 1 — descriptor re-exports (the CRUD default); 2 — island store (`@xstate/store`); 3 — statechart (XState) derived from a `core/domain` transition table. |
| **Graduation trigger** | The measurable condition that licenses moving up a rung: state survives component unmount, multi-component coordination inside the island, optimistic writes spanning more than one entity, undo/redo, validation with dependencies. Enumerable states with transition-legality rules trigger rung 3. A graduating PR must name its trigger. |
| **Descriptors** | The typed query/mutation definitions produced by `core/client` factories (`defineQuery`, `defineMutation`) and bound once in `api.ts`. The descriptor object is the server-state seam. |
| **Bound action** | A descriptor after `api.ts` has bound it to its transport. Features import these; they never see an `ApiClient`, a port or an adapter. |
| **Bus** | Typed, closed unions of client-only, **ephemeral** signals **between island cores**; views never see it. Decided in ADR-0005; the module lands with the first bus event. |
| **Transition table** | The plain-data source of truth for guarded transitions, in `core/domain` — guard ids per destination column. Both the server check and the island's statechart are derived from it. |
| **Oracle** | The table-derived domain machine, consulted by the island's own UI machine (as a guard call, or as an invoked child actor) and never containing UI states. Direction is one-way: UI machine → derived domain machine. |
| **Drift test** | The CI property test that sweeps enumerated states across both derivations of the transition table, proves non-vacuity, and proves its own detection power with a planted mutant. |

See [Client state](../architecture/client-state.md).

## Identity and authorization 🔐 \{#identity-and-authorization}

| Term | Meaning |
|---|---|
| **Tenant** | A foundation entity (`tenants`), never a provider object. One instance hosts many tenants over one shared account pool — a creator's unrelated brands should be tenants, not new deployments. |
| **Instance** | One deployment with one database. New instances are for hard isolation only. |
| **Staff** | The `tenant_admins` aggregate: flat `owner` / `admin` grants. Deliberately no teams or organizations concept — multiple admins are just multiple rows. `owner` and `admin` are **per-tenant grants, not platform roles**: each row ties one account to one tenant, so the same account can be owner of one tenant and admin of another (the seeded demo user is exactly that — owner of `acme`, admin of `globex`). There is **no platform super-admin**: no in-app role stands above tenants; the platform itself is operated through deploys and the database, not through an in-app role. |
| **Member** | An end customer: a tenant-scoped aggregate of our own (profile, tags, GDPR consents, owned email snapshot, export). Not a provider object either. |
| **Principal** | What an identity *acts as* for a decision, derived not stored: `owner`, `admin`, `member`, `visitor`. |
| **Visitor** | An **authenticated** identity with neither a staff grant nor a membership — the tenant-less caller. Not the same as an unauthenticated public reader, which has no identity at all. |
| **Capability** | One entry per aggregate action in a closed union — `todo:read`, `staff:grant`, `domain:write`, … Named by the use-case, resolved by `decide(identity, capability)`. |
| **Grant table** | `Record<Capability, readonly Principal[]>` — the whole policy as data. **Default-deny**: a principal absent from a capability's list is denied, and there is no wildcard-allow. |
| **Tenant resolution** | Answering *which* tenant a request is for, in one fixed order: exact custom domain → subdomain label of `APP_BASE_DOMAIN` → `X-Tenant` header. Separate from authorization. |
| **Existence-hiding** | Returning `tenant_not_found` — byte-identical for "no such tenant" and "no access" — when a tenant was addressed by slug or header. Deliberate, and recorded so nobody "fixes" it to `forbidden`. |
| **Slug (value object)** | Free input is **normalized** (lowercased, non-alphanumeric runs collapsed to single hyphens, ends trimmed) and then **validated** (3–63 chars, canonical pattern, not a reserved subdomain), so only one canonical form is ever persisted or resolved. |

See [Identity & multi-tenancy](../architecture/identity-and-multi-tenancy.md) and
[Authorization](../architecture/authorization.md).

## Errors and the contract 🚨 \{#errors-and-the-contract}

| Term | Meaning |
|---|---|
| **`Result<T, E>`** | `{ ok: true, value }` or `{ ok: false, error }`. Use-cases return it for domain errors instead of throwing. |
| **`AppError`** | `code` from the closed `ErrorCode` union, a `message`, and optional `details` (typically a zod `flatten()`). |
| **Error taxonomy** | The closed `ErrorCode` union, mapped exhaustively to HTTP statuses **and** to CLI exit codes in `core/contract/http-status.ts`. |
| **Envelope** | The single response shape: `{ ok: true, data }` or `{ ok: false, error }`, JSON on every path including 404 and 503. |
| **Normalization edge** | `app.onError` — the one place a thrown port promise becomes `internal`. Use-cases never grow per-call `try`/`catch` for infrastructure failures. |
| **Expand → contract** | The two-deploy discipline for any breaking change: deploy 1 adds the new shape alongside the old (both accepted and emitted), deploy 2 removes the old once every consumer moved. Used for both contract changes and destructive migrations — one vocabulary for both. |
| **Stale tab** | The only real client/server skew: a long-lived SPA session running yesterday's bundle. `core/client` zod-parses every response and fails loud rather than rendering wrong data. |

See [Errors & API versioning](../architecture/errors-and-api-versioning.md).

## Data 🗄️ \{#data}

| Term | Meaning |
|---|---|
| **MUST-ATOMIC** | An operation that must never be observable half-done. Implemented as **one** port method backed by a sanctioned idiom, so the compiler prevents a caller from half-doing it. The list is machine-checked against `ports.ts`. |
| **Sanctioned idiom** | A single-statement CTE via `db.execute`, or `db.batch([...])`. Both are atomic on `node-postgres` **and** `neon-http`. |
| **The `neon-http` trap** | Interactive `db.transaction(async tx => …)` is atomic on `node-postgres` but **not** on Neon's stateless HTTP driver, so it is forbidden for any MUST-ATOMIC operation. |
| **Hard delete** | The default: a tenant-scoped delete removes the row. `deleted_at` is per-feature and rare, because "soft-delete everything" fails the first time a query forgets the filter. |
| **Tenant offboarding** | One `DELETE FROM tenants WHERE id = $1`: every tenant-scoped table FK-chains to `tenants(id)` with `ON DELETE CASCADE`, so the *database* guarantees no orphans. Shared account tables are deliberately outside the chain. |
| **Grandfather list** | The named set of existing tables that keep their legacy shape (text ids, text ISO timestamps) rather than being migrated. Documented legacy, never a template — and the list is **closed**. |
| **Invariant placement** | The deliberate choice of where a data invariant is enforced: at the DB, at the DB *and* the app boundary, or app-only with a stated reason the DB cannot express it. Default is push it to the DB. |
| **Backfill** | A resumable, idempotent batch data operation with a durable checkpoint (`backfill_checkpoints`), driven per target: a network-isolated internal endpoint on self-host, a secret-gated route on Vercel. |

See [Data & transactions](../architecture/data-and-transactions.md).

## Gates, verification and doctrine 🛡️ \{#gates-verification-and-doctrine}

| Term | Meaning |
|---|---|
| **Gate** | A red-or-green mechanical check. The static gate is `pnpm run check`; the runtime gate is `pnpm run smoke`. Static-green is not done — the app must actually run. |
| **`check`** | `typecheck` + `typecheck:islands` + `lint` + `lock-lint` + `depcruise` + `knip` + `doc-lint` + `test:coverage`. |
| **`smoke`** | Boots the real server against a real database and drives health → sign-in → todos through the CLI, asserting taxonomy exit codes. `smoke:remote` runs the same CLI suite against a deployment URL. |
| **Release version** | SemVer from `demo/package.json`, bumped only by the release-cut pull request that precedes a promotion, tagged `vX.Y.Z`, and reported by health, the console banner, footer/login stamp, settings, and CLI. |
| **Attestation** | The SemVer release `version` + commit `sha` carried by every health response, so a smoke run can prove *which* deploy it verified. `sha` is a vendor-neutral `APP_COMMIT_SHA`; unset (local dev) it reports `unknown`. |
| **`EXPECTED_SHA`** | The deployment event's SHA, passed to `smoke:remote`, which asserts `health.sha === EXPECTED_SHA` — closing the "smoked the wrong deployment" class of failure. |
| **Canary tenant** | The ring-fenced smoke account and tenant that `smoke:remote` drives against live production. Disposable, belongs to no creator, and non-self-poisoning by construction: every card a run creates ends in an unbounded column. |
| **Config-regression probe** | A test whose subject is the **configuration**, not the code: it plants a violating fixture (or parses a doc block) and asserts the gate still fires. Lives in `config-regression/`. It is how a lint rule or a doc promise is kept from rotting. |
| **`doc-lint`** | The gate that keeps docs and enforcers in sync: removing an enforcer from config without updating the docs that promise it fails the build. It also lints the drizzle migration sequence. |
| **Enforcement matrix** | The four tiers every rule in the normative docs declares — **TYPE / LINT / TEST / REVIEW+AI** — each cell saying *how*, or `n/a` with a reason. A rule without a matrix is prose, and prose decays. |
| **NORMATIVE NOW** | A rule that applies to the current tree. |
| **NORMATIVE WHEN TRIGGERED** | A decided rule that activates on a **named** trigger, and is honestly not built until then. |
| **OUT OF SCOPE** | Deliberately not the foundation's problem, with the reason stated. |
| **Deferred-work register** | [`docs/backlog.md`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/backlog.md) — accepted-but-unbuilt work and accepted verification residuals, each with a named trigger, so the architecture doc never carries a silent gap. |
| **DECIDE `<id>`** | An owner ruling on a question only the owner can settle, cited by its queue id — `DECIDE F1` (the AI-reviewer gate), `DECIDE F3` (a flake is a P1 bug). The still-open ids are listed in the [deferred-work register](https://github.com/chomamateusz/agentproofarch/blob/main/docs/backlog.md); a decided one is written into the doc or ADR it governs. |
| **US-`<n>`** | A user story from the [PRD](https://github.com/chomamateusz/agentproofarch/blob/main/docs/prd-agentproofarch-foundation.md), cited by its number — `US-020` is the Vercel domain-provisioning adapter. Build status per story lives in the deferred-work register. |
| **Wide event** | One context-rich event per request per service hop: annotate the active span as context accrues, emit once. Never step-log. Observability, **not** an audit trail — see [Observability](../architecture/observability.md). |
| **TIMELINE-TRACE** | The security doctrine that every security claim must be justified by tracing the **actual** event order — who acts, when, with what privilege — not the intended order. A claim not walked step by step is a hypothesis, not a control. |
| **CHEAP SECRETS** | The doctrine that every production secret must be least-privilege, revocable, and asymmetric-verify where possible — because a production build sees them all. |

See [CI gates](../operations/ci-gates.md) and
[Health & attestation](../operations/health-and-attestation.md).

## Foundation lifecycle 🌱 \{#foundation-lifecycle}

These three terms describe one scenario: you copy this repository's `demo/`
directory as the starting point — the *foundation* — of your own app.

The demo code is not what you are taking. Todos, cards and the seeded tenants
get replaced by your own domain. What you carry forward is the **enforcement
configuration**: the lint rules, dependency-cruiser config, `tsconfig`
strictness, gate scripts, config-regression probes and CI workflows. That is
the part which encodes the architecture *structurally* instead of describing it
in prose.

Your app then writes one provenance file, `FOUNDATION.md`, recording where it
forked from. Picking up a later foundation improvement — a security fix, a
tightened rule — is then a mechanical diff over the recorded paths rather than
a guess.

Knowingly weakening one of the structural rules stays a legitimate choice. It
simply means you are "off the foundation", and the guarantees no longer hold.

| Term | Meaning |
|---|---|
| **The portable artifact** | What actually travels from the foundation into your app: the enforcement configuration, not the code. Concretely `eslint.config.js` + `eslint-plugin-agentproofarch/`, `.dependency-cruiser.cjs`, `tsconfig` strictness, the gate scripts, `config-regression/` and the CI workflows. |
| **`FOUNDATION.md`** | The provenance file your app writes at its root: upstream repo URL, forked commit SHA, fork date, and the foundation-owned paths. A foundation update is then `git diff <sha>..upstream` over exactly those paths. |
| **Off the foundation** | Knowingly weakening a *structural* rule — a client importing `core/server`, a framework in `core/**`, dissolving the `core/contract` seam, throwing across a boundary, re-enabling `any`/`as`. Legitimate, but it forfeits the name and the guarantees — and `doc-lint` makes sure it cannot happen silently. |
