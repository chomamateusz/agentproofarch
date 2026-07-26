---
title: ADR-0010 — Tenant-creation policy (TENANT_CREATION)
sidebar_label: 0010 · Tenant-creation policy
description: One env key, three modes — open, staff, closed — selecting who may create tenants, with default-deny untouched.
---

# ADR-0010 — Tenant-creation policy: an env-selected `TENANT_CREATION` mode

**2026-07-26 · accepted (owner-approved).** Builds on [ADR-0002](./0002-member-identity-and-idp.md) (one global account pool, per-request identity resolution) and the capability model in [Authorization](../architecture/authorization.md). → [full ADR on GitHub](https://github.com/chomamateusz/agentproofarch/blob/main/docs/decisions/0010-tenant-creation-policy.md)

## Summary

One env key, `TENANT_CREATION ∈ open | staff | closed` (default `open`), selects the principal list of the single `tenant:create` grant row. Nothing else in the policy moves: no new principals, no new capability, no branch in `decide`, and default-deny untouched — `closed`'s empty list denies everyone by the ordinary rule, not by a special case.

## The WHY

Two properties of the capability model compose into a grant wider than the row alone suggests:

1. **Principal derivation is per-request and per-tenant-context.** A `visitor` is not a separate class of account — it is what **any authenticated identity** looks like when no tenant is resolved, which is exactly the base domain with no tenant selected.
2. **Creation is self-service and atomic.** `createTenant` runs the tenant-agnostic `authorize`, then writes the tenant row and the caller's owner grant together. No operator approval exists anywhere in the path.

Composed: **every authenticated account on the instance can create a tenant and own it** by addressing the base domain. For a public-SaaS instance that is the product — sign up, create your workspace, own it. For a **single-creator instance** it is the wrong default: the shared account pool is populated by the creator's *end customers*, and any of them signing in at the base domain presents as a `visitor` holding `tenant:create`. The model behaves exactly as written; the grant row is a product decision the codebase used to hardcode to one answer.

## Decided

### 1. One env key, three modes

| mode | `tenant:create` granted to | instance shape |
|---|---|---|
| `open` (default) | `owner`, `admin`, `visitor` | public SaaS — any authenticated account self-serves a tenant |
| `staff` | `owner`, `admin` | only existing staff spawn additional tenants; the first comes from seed/operator |
| `closed` | — (nobody) | operator-only: tenants exist because seed/ops created them |

The `open` default preserves prior behaviour exactly — tightening an instance is an operator env change, not a code change. The zod schema default in `core/server/config.ts` is the **only** place that default lives: in code the mode is a required parameter end-to-end (`decide`, `Ctx`), so a call site cannot silently fall back to the most permissive policy.

### 2. The policy stays data

The grants table remains a `Record<Capability, readonly Principal[]>`, now *derived* from the mode — the mode selects one row's principal list. The mode table itself is a `Record<TenantCreationMode, …>`, so adding a mode without deciding its grants is a compile error, exactly like adding a capability without deciding its principals.

### 3. `staff` requires the create path to see staff-ness

The HTTP create route deliberately sits **above** tenant resolution, so every caller used to reach `createTenant` as a `visitor` — against that wiring the `staff` row would deny everyone and be indistinguishable from `closed`. The create path therefore derives the caller's principal from their staff grants **across the instance** (`TenantAccessReader.listTenantsForStaff`, the same read `listMyTenants` uses). The grant table alone does not deliver `staff`; this derivation is a named part of the decision.

## Alternatives considered

| Alternative | Verdict | Why |
|---|---|---|
| **A platform super-admin role** (an in-app instance-level administrator who may create tenants under every mode) | rejected | A strictly heavier tier — a fifth principal, an instance-scoped grant outside tenant scope, its own storage, enforcement path and escalation risk — with **no named trigger** asking for it. Operator-only creation is already reachable through seed/ops. Revisitable the moment a real requirement names it. |
| **A new capability or principal per mode** | rejected | The change is the *content* of one grant row, not the shape of the model. |

## Consequences

- **A new key in the single env schema** and a matching `.env.example` entry; doc-lint enforces *schema ⊆ .env.example*, so the key cannot ship undocumented.
- **Denial under `staff`/`closed` is the existing `forbidden` error** (exit 4) — no new error codes, no new status, no new client branch; a mode is invisible to the contract.
- **The exhaustive `decide` cell suite** asserts the `tenant:create` row across all three modes rather than once.
- **The capability table in [Authorization](../architecture/authorization.md) documents the mode-dependence** — the `tenant:create` cells are mode-derived, and the prose names the env key.

:::caution[Honest caveats]
- **Bootstrapping is an accepted cost of the tighter modes.** Under `staff` the first tenant cannot be created in-app — no staff exists until a tenant does — so it comes from seed/operator; under `closed` every tenant does. That is the point of those modes, not a gap in them.
- **`open` remains the default.** An instance that needs tightening must set the env key; nothing detects "this looks like a single-creator instance" automatically.
:::
