---
title: CLI command reference
sidebar_label: 📇 CLI command reference
description: Every command group and subcommand, with real output — lookup by anchor, not by scroll.
---

# CLI command reference 📇 \{#cli-command-reference}

*Read this as a lookup: the table of contents on the right has one anchor per subcommand. The invocation model, global options and exit codes are on the [CLI walkthrough](./cli-walkthrough.md).*

Every command group below exists in `demo/apps/cli/src/main.ts`. Run everything
from `demo/`; `--silent` keeps pnpm's own output off stdout.

## Session commands 🔐 \{#session-commands}

### `health` 🩺 \{#health}

```bash
pnpm --silent run cli health
```

```text
status=ok db=up v0.1.0 sha=unknown
```

`version` is `package.json`'s version — the single release-identity source — and
`sha` is the build attestation (`APP_COMMIT_SHA`), reported as `unknown` locally
because only a deploy sets it. There are three health routes:
`/api/health/live` (never touches the database), `/api/health/ready` (returns the
`unavailable` envelope with HTTP 503 when the database is down, never a 200), and
the compat `/api/health` the `health` command calls, which reports the database
status inline at 200.

### `register` and `login` 🔑 \{#register-and-login}

```bash
pnpm --silent run cli register --name Demo --email demo@agentproofarch.dev --password demo1234
pnpm --silent run cli login --email demo@agentproofarch.dev --password demo1234
```

```text
registered and signed in as demo@agentproofarch.dev
signed in as demo@agentproofarch.dev
```

### `whoami` 🪪 \{#whoami}

```bash
pnpm --silent run cli whoami
```

```text
demo@agentproofarch.dev @ Acme Sp. z o.o. (acme, staff: owner)
```

With no tenant selected `whoami` prints
`demo@agentproofarch.dev (no tenant selected)`. Its `--json` form is the
`/api/me` payload:

```json
{
  "ok": true,
  "data": {
    "userId": "…",
    "email": "demo@agentproofarch.dev",
    "name": "Demo User",
    "tenant": {
      "id": "tenant-acme",
      "slug": "acme",
      "name": "Acme Sp. z o.o.",
      "staffRole": "owner",
      "memberId": null
    }
  }
}
```

### `login-link` ✉️ \{#login-link}

Passwordless sign-in is two steps, because there is deliberately no in-app
dev route that hands you the link:

```bash
pnpm --silent run cli login-link --email mag@example.com
# → magic link requested for mag@example.com — open it from your inbox (dev/CI: Mailpit)
#   read it at http://localhost:47980
pnpm --silent run cli login-link --email mag@example.com --link 'http://localhost:47100/api/auth/magic-link/verify?...'
# → signed in as mag@example.com via magic link
```

### `logout` 🚪 \{#logout}

```bash
pnpm --silent run cli logout        # revokes server-side, then drops the token
```

## `tenant` 🏢 \{#tenant}

`tenant` is the **staff** surface — the tenants you administer, not the tenants
you are a customer of.

### `tenant list` 📃 \{#tenant-list}

```bash
pnpm --silent run cli tenant list
```

```text
acme	Acme Sp. z o.o.	(owner)
globex	Globex Corp	(admin)
```

### `tenant create` ➕ \{#tenant-create}

```bash
pnpm --silent run cli tenant create Northwind Traders
# → created tenant: Northwind Traders (northwind-traders)
```

`tenant create` derives the slug from the name with `normalizeSlug` unless you
pass `--slug`, and makes you its owner.

### `tenant switch` 🔀 \{#tenant-switch}

```bash
pnpm --silent run cli tenant switch globex
# → active tenant: Globex Corp (globex)
```

`tenant switch` first checks the slug against your staff memberships and refuses
locally with `not_found` (exit 5) — "You do not administer any tenant with slug …"
— before writing anything to config.

## `todo` 📝 \{#todo}

The smallest complete vertical slice, and the one the smoke gate drives.

### `todo list` 📃 \{#todo-list}

```bash
pnpm --silent run cli --tenant acme todo list
```

```text
- Wdrożyć walking skeleton na produkcję  (3f8a1c02)
- Sprawdzić izolację danych między tenantami  (b17d94ee)
```

Ids are printed truncated to 8 characters; `--json` gives you the full row:

```json
{
  "ok": true,
  "data": {
    "todos": [
      {
        "id": "3f8a1c02-…",
        "tenantId": "tenant-acme",
        "title": "Wdrożyć walking skeleton na produkcję",
        "createdBy": "…",
        "createdAt": "2026-07-26T09:12:44.921Z"
      }
    ]
  }
}
```

Tenant isolation is not a filter you remember to apply — every tenant-scoped
use-case takes `ctx.identity` and every repository method requires a `tenantId`.
Switch the header and the same command returns a different world:

```bash
pnpm --silent run cli --tenant globex todo list
# → - Globex: przygotować prezentację architektury  (…)
```

### `todo add` ➕ \{#todo-add}

```bash
pnpm --silent run cli --tenant acme todo add Buy milk
```

```text
added: Buy milk (9c2e04b7)
```

## `card` 🃏 \{#card}

Two boards share one substrate. `--board personal` (the default) has columns
`todo`/`doing`/`done` and no path rules. `--board team` is the *guarded* exemplar:
ordered columns `todo → in-dev → review → done`, with WIP limits of **3** on
`in-dev` and **2** on `review`.

### `card list` 📃 \{#card-list}

```bash
pnpm --silent run cli card list
pnpm --silent run cli card list --board team
```

```text
- [todo] Sketch the API  (5b1f7ac9)
- [in-dev] Ship it  (ae30c184)
```

### `card add` ➕ \{#card-add}

```bash
pnpm --silent run cli card add Sketch the API
pnpm --silent run cli card add Ship it --board team
```

```text
added: Sketch the API [todo#0] (5b1f7ac9)
added: Ship it [todo#0] (ae30c184)
```

Team cards are born in `todo` only — the entry column is a rule, not a
default, because a card spawned directly in `done` would have bypassed every
guard below.

### `card move` 🔀 \{#card-move}

```bash
pnpm --silent run cli card move <id> --board team --to in-dev
```

```text
moved: Ship it -> [in-dev#0] (ae30c184)
```

`move` takes `--to <column>` (required) and an optional 0-based `--index`;
omitting `--index` appends to the end of the target column. Three team-board
guards can reject a move, and the rejection is a `validation` error (exit 2) that
names the broken rule:

| Guard | Rule |
|---|---|
| `wip-limit` | the destination column is at its limit (`in-dev`: 3, `review`: 2) |
| `review-requires-in-dev` | a card may only enter `review` if it has visited `in-dev` |
| `done-only-from-review` | `done` is reachable only from `review` |

```bash
pnpm --silent run cli card move <id> --board team --to done; echo "exit=$?"
# → error(validation): …done-only-from-review…
# → exit=2
```

## `member` 👥 \{#member}

Members are the tenant's **end customers** — a different concept from staff. The
whole group is staff-only.

### `member list` 📃 \{#member-list}

```bash
pnpm --silent run cli --tenant acme member list
```

```text
- alice@example.com	Alice Example  (member-a)  [vip, early-adopter]
- mag@example.com	Magic Link Member  (member-a)  [provisioned]
```

### `member ensure` ➕ \{#member-ensure}

```bash
pnpm --silent run cli member ensure carol@example.com --name "Carol Example" --tag vip --tag beta
# → created: carol@example.com (…)      # run again → exists: carol@example.com (…)
```

`ensure` is idempotent find-or-create keyed on email — the entry point a
provisioning integration calls.

### `member update` ✏️ \{#member-update}

```bash
pnpm --silent run cli member update <id> --name "Carol E." --tag vip
```

`update --tag` **replaces** the whole tag set (and `--clear-name` clears the
display name explicitly, which is why it is a separate flag from omitting
`--name`).

### `member export` 📤 \{#member-export}

```bash
pnpm --silent run cli member export <id>
# → exported carol@example.com at 2026-07-26T09:31:02.004Z
```

`export` is the GDPR access/portability dump.

### `member remove` 🗑️ \{#member-remove}

```bash
pnpm --silent run cli member remove <id>
# → removed: <id> (members deleted: 1)
```

`remove` deletes the member and their tenant-scoped data while leaving the
global account untouched.

## `staff` 👑 \{#staff}

Flat `owner`/`admin` grants — there is no organizations/teams concept in the
foundation. Listing is staff-readable; granting and revoking are **owner-only**.

### `staff list` 📃 \{#staff-list}

```bash
pnpm --silent run cli staff list
```

```text
- demo@agentproofarch.dev	Demo User  (owner)
```

### `staff grant` ➕ \{#staff-grant}

```bash
pnpm --silent run cli staff grant colleague@example.com
# → granted: colleague@example.com (admin)     # re-run → already staff: …
```

There are **no invitations**: the target must already have an account, and a
grant against an unknown email is `not_found` (exit 5).

### `staff revoke` 🗑️ \{#staff-revoke}

```bash
pnpm --silent run cli staff revoke --email colleague@example.com
# → revoked: … (grants removed: 1)
```

Revoking the last owner is refused — the tenant cannot be left ownerless.

## `domain` 🌐 \{#domain}

Custom domains for the active tenant. Reading is staff-readable; add, check and
remove are owner-only. The transcripts below are shown with the **`noop`
provisioner** — the dev and Vercel default; the `caddy` self-host provisioner
prints a real DNS target instead ([Custom domains & TLS](../operations/self-host-and-domains.md#driving-it-from-the-cli)).

### `domain list` 📃 \{#domain-list}

```bash
pnpm --silent run cli --tenant acme domain list
```

```text
- acme.localhost	verified
(no DNS target configured)
```

The target line is what the web add-flow renders as the DNS record to create. It
reports `no DNS target configured` under the `noop` provisioner because that
provisioner sets neither a CNAME nor an IP; the `caddy` self-host provisioner
sets exactly one.

### `domain add` ➕ \{#domain-add}

```bash
pnpm --silent run cli domain add shop.example.com
# → attached: shop.example.com (pending)
```

A newly added domain is **unverified** until `domain check` confirms DNS points at
the deploy target.

### `domain check` 🔍 \{#domain-check}

```bash
pnpm --silent run cli domain check shop.example.com
# → shop.example.com: pending — <detail from the DNS check>
```

### `domain remove` 🗑️ \{#domain-remove}

```bash
pnpm --silent run cli domain remove shop.example.com
# → removed: shop.example.com (rows: 1)
```

See [Custom domains & TLS](../operations/self-host-and-domains.md) for the two
provisioning paths.

## `public` 📣 \{#public}

### `public profile` 👁️ \{#public-profile}

The unauthenticated read surface, deliberately exercised with **no session** — the
command builds a second API client that carries neither token nor tenant header.

```bash
pnpm --silent run cli public profile acme
```

```text
acme	Acme Sp. z o.o.	(v1f4kq9)
```

It is a two-step call on purpose, mirroring the caching model: discovery
(`/api/public/tenants/acme`) returns the current content version, then the
version-keyed profile (`/api/public/tenants/acme/v/<version>`) is fetched — that
URL is long-cached and busted by the version in the path, not by a header. The
profile carries only `slug`, `displayName` and `contentVersion`; the schema strips
anything else that tries to ride along. The version token is derived from the
tenant's visible content, so a rename changes it — yours will differ from the
sample. Rationale:
[ADR-0006](../decisions/0006-public-read-only-surface.md).
