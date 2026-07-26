---
title: Authorization (default-deny)
sidebar_label: Authorization
description: A closed capability union, a wildcard-free grant table, and the tests that pin every cell.
---

# Authorization (default-deny)

This page exists because "we check permissions in the handlers" is how
cross-tenant data leaks happen. Authorization here is **one pure function over
one closed table**, called as the first statement of every tenant-scoped
use-case, with an exhaustive unit suite that asserts every capability × principal
cell and a structural probe that fails the build when a new use-case forgets the
call. Nothing is granted by wildcard: a principal absent from a capability's list
is denied.

## Two questions, two steps

Tenant resolution answers *which* tenant and *whether* the caller belongs to it
([Identity & multi-tenancy](identity-and-multi-tenancy.md)). Authorization answers
*what* they may do there. Keeping them separate is what makes the second step a
pure, testable function.

```mermaid
graph TD
    id["Identity from resolveIdentity"] --> pr["principalOf(identity)"]
    pr --> owner["owner — staffRole is owner"]
    pr --> admin["admin — staffRole is admin"]
    pr --> member["member — memberId set, no staff grant"]
    pr --> visitor["visitor — neither, the tenant-less identity"]
    owner --> table["GRANTS lookup for the named capability"]
    admin --> table
    member --> table
    visitor --> table
    table --> held{"principal listed?"}
    held -->|no| deny["forbidden — HTTP 403, CLI exit 4"]
    held -->|yes| scoped{"tenantId resolved?"}
    scoped -->|no| tnf["tenant_not_found — HTTP 404, CLI exit 7"]
    scoped -->|yes| allow["ok with the non-null tenantId"]
```

## The capability model

`core/domain/authorization.ts` holds the whole policy — no framework, no
database, no I/O. The `Capability` union is closed:

```ts
export const CAPABILITIES = [
  'todo:read', 'todo:write',
  'card:read', 'card:write',
  'member:read', 'member:write', 'member:remove', 'member:export',
  'staff:read', 'staff:grant', 'staff:revoke',
  'domain:read', 'domain:write',
  'tenant:create',
] as const;

export const PRINCIPALS = ['owner', 'admin', 'member', 'visitor'] as const;
```

The principal is derived, never stored:

```ts
export const principalOf = (identity: Identity): Principal => {
  if (identity.staffRole === 'owner') return 'owner';
  if (identity.staffRole === 'admin') return 'admin';
  if (identity.memberId !== null) return 'member';
  return 'visitor';
};
```

`owner` and `admin` are **distinct principals**. They were a single `staff`
principal until FR-8; the staff-grant surface is the first capability where they
diverge, so the split is honest rather than cosmetic.

## The grant table

The policy is data — a `Record<Capability, readonly Principal[]>` — so adding a
capability without deciding its grants **does not compile**:

| capability | owner | admin | member | visitor (tenant-less) |
|---|---|---|---|---|
| `todo:read` | allow | allow | allow | deny |
| `todo:write` | allow | allow | allow | deny |
| `card:read` | allow | allow | allow | deny |
| `card:write` | allow | allow | allow | deny |
| `member:read` | allow | allow | deny | deny |
| `member:write` | allow | allow | deny | deny |
| `member:remove` | allow | allow | deny | deny |
| `member:export` | allow | allow | deny | deny |
| `staff:read` | allow | allow | deny | deny |
| `staff:grant` | allow | **deny** | deny | deny |
| `staff:revoke` | allow | **deny** | deny | deny |
| `domain:read` | allow | allow | deny | deny |
| `domain:write` | allow | **deny** | deny | deny |
| `tenant:create` | allow | allow | **deny** | **allow** |

Reading the interesting rows:

- **Members are full collaborators, not administrators.** `todo:*` and `card:*`
  are granted to `member` because todos and cards are collaborative aggregates.
  Tenant administration is not.
- **`member:*` is staff-only on purpose.** Members are the end customers this
  aggregate is *about*, managed **by** staff — granting a member `member:read`
  would let one customer enumerate the tenant's customer list. A customer's
  legitimate self-scoped read is `/api/me`, which carries no capability.
  `member:remove` is split from `member:write` so a future policy can reserve
  destructive removal for owners without reopening the capability set.
- **Only an owner may mint or remove staff** (FR-8). An admin runs the tenant but
  cannot create peers, and the **last owner cannot be revoked** — a lockout guard
  that returns a `validation` error from `revokeAdmin`. Granting admin targets an
  **existing** account by email (there are no invitations yet), so `grantAdmin`
  returns `not_found` when the email has no account.
- **`domain:write` is owner-only** for the same reason: an admin runs the tenant
  without changing *where it is reachable*.
- **`tenant:create` is tenant-less self-service** — the caller becomes owner — so a
  `visitor` holds it while a `member` of one tenant may not provision others.

:::caution The one cell that is not HTTP-reachable
The `member` deny on `tenant:create` is **use-case-layer only**. Over HTTP the
create route deliberately sits above tenant resolution, so every authenticated
caller presents as `visitor`; and a member could in any case drop the tenant
header and legitimately present as one. The cell exists as defense-in-depth for
future callers that carry a member context — not as a barrier you can probe from
outside.
:::

## One line per use-case

Two helpers live in `core/server/authorize.ts`. `authorize` is the tenant-agnostic
variant; `authorizeTenant` both denies **and** hands back the resolved non-null
`tenantId`:

```ts
export const authorize = (ctx: Ctx, capability: Capability): AppError | null => {
  const verdict = decide(ctx.identity, capability);
  return verdict.allowed ? null : forbidden(verdict.reason);
};

export const authorizeTenant = (ctx: Ctx, capability: Capability): Result<string, AppError> => {
  const denial = authorize(ctx, capability);
  if (denial) return err(denial);
  return ctx.identity.tenantId === null
    ? err(tenantNotFound('Select a tenant'))
    : ok(ctx.identity.tenantId);
};
```

Every tenant-scoped use-case therefore opens the same way, **before any
repository access**:

```ts
export const listTodos = async (ctx: Ctx, deps: TodoDeps): Promise<Result<Todo[], AppError>> => {
  const scope = authorizeTenant(ctx, 'todo:read');
  if (!scope.ok) return scope;
  return ok(await deps.todos.listByTenant(scope.value));
};
```

`scope.value` is a narrowed `string`, so the repository call cannot be made
against a null tenant — the denial and the scoping are the same statement.

A capability is modelled only where authorization is a **real decision**:
`listMyTenants` enumerates the caller's *own* staff memberships, so it is gated by
authentication and carries no capability. A self-scoped read is not an access
decision.

## Public routes never authorize

The public contract group (`/api/public/*`) is unauthenticated, so expressing its
reads as a `visitor` capability would be dishonest — `visitor` is an
*authenticated* tenant-less principal, and a public reader is not authenticated at
all ([ADR-0006](../decisions/0006-public-read-only-surface.md)).

Instead the public handlers are registered **ahead of** the `/api/*`
tenant-resolution middleware and call only use-cases that take **no** identity
argument — e.g. `getPublicTenantProfile`. A public handler *structurally
cannot* reach a tenant-scoped, identity-bearing use-case. Public reads live
**outside** the capability model by construction, not as a new grant row.

That is enforced, not asserted: `config-regression/public-surface.test.ts` scans
the public app for any identity-bearing use-case name or
`authorize`/`resolveIdentity` reference, and asserts the public use-case's first
parameter is not `ctx: Ctx`.

## How each rule is actually held

The foundation's convention is that every rule carries an explicit enforcement
matrix, because a rule without one is prose, and prose decays.

| Tier | What it holds here |
|---|---|
| **TYPE** | `Capability` is a closed union and the helpers take it as a required argument, so a use-case cannot name a capability the union does not declare. `Record<Capability, readonly Principal[]>` is exhaustive, so adding a capability without deciding its grants fails to compile. |
| **LINT** | *n/a* — "call the predicate first" is a call-site discipline, not a syntactic shape a rule can match. |
| **TEST** | the exhaustive `decide` matrix, per-use-case denial tests, the scaffolder's generated tests, and the structural probe (below). |
| **REVIEW+AI** | flag a tenant-scoped use-case that touches a repository *before* the predicate, any grant that widens a capability beyond the table above, and any new entry in the probe's authentication-only allowlist without a self-scoped-read rationale. |

:::caution Honest limit of the type tier
The compiler forces the capability **name**, not the **call**. A use-case that
never calls `authorize`/`authorizeTenant` at all still typechecks. That gap is why
the structural probe below exists — and why the probe's own limits are stated
rather than glossed.
:::

## The denial tests

**1. The exhaustive matrix.** `core/domain/authorization.test.ts` declares an
`EXPECTED: Record<Capability, Record<Principal, boolean>>` — exhaustive by
construction — and generates one test per cell, so every allow *and* every deny in
the table above is pinned. It also asserts the structural properties: a denial
always carries a reason and a grant never does, `owner` holds every capability,
and `admin` is denied exactly the owner-only rows (the FR-8 split).

**2. Per-use-case tests.** Each tenant-scoped use-case's suite asserts
staff-allowed, member allowed-or-denied per policy, and the tenant-less caller
denied.

**3. The scaffolder generates them.** `npm run new:resource` emits all three
outcomes as real tests for a new aggregate — staff allowed, member allowed per the
baseline collaborative policy (the test title carries the flip-to-forbidden
guidance for a staff-only aggregate), and the tenant-less caller `forbidden`. A
new aggregate therefore starts with its denial tests already written.

**4. The structural probe.** `config-regression/authorization.test.ts` scans
`core/server/usecases/*.ts`, treats every exported `const` whose first parameter is
`ctx: Ctx` as tenant-scoped, and asserts each one references
`authorize`/`authorizeTenant`. Its honest limits are written into the file itself:

- it matches the helper **in the function body** (a regex over source), not that
  the call *precedes* repository access — that ordering stays a review lever;
- a use-case shaped differently escapes detection;
- an intentional authentication-only use-case is a **named, reasoned allowlist
  entry** (today exactly one: `listMyTenants`, "self-scoped read of the
  caller-own staff memberships — authentication is the control, no capability"),
  never a silent omission;
- the probe also asserts it found the known use-cases, so a broken scan cannot
  pass vacuously, and that the allowlist has no stale entries.

## Adding a capability

1. Add the string to `CAPABILITIES` in `core/domain/authorization.ts`.
2. The `GRANTS` record now fails to compile — decide, explicitly, which principals
   hold it.
3. Extend `EXPECTED` in the test (also exhaustive) with the four cells.
4. Name it in the use-case's first statement via `authorize` / `authorizeTenant`.
5. Add the denial tests, or let `npm run new:resource` scaffold them.

There is no step where a wildcard shortcut exists, which is the point.
