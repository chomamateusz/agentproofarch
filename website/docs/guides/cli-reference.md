---
title: CLI command reference
sidebar_label: 📇 CLI command reference
description: Every command group and subcommand, with real output — lookup by anchor, not by scroll.
---

# CLI command reference 📇 \{#cli-command-reference}

*Read this as a lookup: the table of contents on the right has an anchor per command group. The invocation model, global options and exit codes are on the [CLI walkthrough](./cli-walkthrough.md).*

Every command group below exists in `demo/apps/cli/src/main.ts`. Run everything
from `demo/`; `--silent` keeps pnpm's own output off stdout.

## Session: `health`, `register`, `login`, `login-link`, `logout`, `whoami` 🔐 \{#session-health-register-login-login-link-logout-whoami}

### `health` 🩺 \{#health}

```bash
pnpm --silent run cli health
```

```text
status=ok db=up v1.0.0 sha=unknown
```

`version` is `package.json`'s version — the single release-identity source — and
`sha` is the build attestation (`APP_COMMIT_SHA`), reported as `unknown` locally
because only a deploy sets it. There are three health routes:
`/api/health/live` (never touches the database), `/api/health/ready` (returns the
`unavailable` envelope with HTTP 503 when the database is down, never a 200), and
the compat `/api/health` the `health` command calls, which reports the database
status inline at 200.

### `--version` and `version` 🏷️ \{#version}

`agentproofarch --version` prints one plain version line and exits 0, exactly
like `--help`; it is deliberately not a JSON envelope. The machine-readable
surface is `agentproofarch --json version`, which emits exactly one success
envelope. The "`--json` prints exactly one JSON envelope" contract covers
commands, not Commander's built-in informational flags.

The CLI reports no commit SHA because it runs from source through `tsx` and has
no build step or build attestation. Use `agentproofarch health` for the server's
SHA.

### `register`, `login`, `whoami` 🔑 \{#register-login-whoami}

```bash
pnpm --silent run cli register --name New --email new-user@example.com --password demo1234
pnpm --silent run cli login --email demo@agentproofarch.dev --password demo1234
pnpm --silent run cli whoami
```

```text
registered and signed in as new-user@example.com
signed in as demo@agentproofarch.dev
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
pnpm --silent run cli logout        # attempts server revocation, then drops the active origin's token
```

The CLI attempts server-side revocation first, then clears the active origin's
local token even if revocation fails. Only that origin's profile is touched;
sessions stored for other origins stay signed in.

## `origin`: `list`, `use` 🌍 \{#origin-list-use}

The CLI keeps one session profile — token and selected tenant — per canonical
API origin in `~/.config/agentproofarch/config.json`; precedence and the config
shape are on the
[CLI walkthrough](./cli-walkthrough.md#global-options-and-stored-config).

```bash
pnpm --silent run cli origin list
```

```text
* http://localhost:47100	token=present	tenant=acme
  https://agentproofarch.vercel.app	token=absent
```

The `*` marks `currentOrigin`; each line reports only whether a token is stored
(`present`/`absent`), never the token itself. With nothing stored yet it prints
`no configured origins`.

```bash
pnpm --silent run cli origin use https://agentproofarch.vercel.app
# → active origin: https://agentproofarch.vercel.app
```

`origin use` selects the stored default without making a network call, so
switching context never costs a request. Inside this checkout, repo detection
still points ordinary invocations at the local dev server; `--api-url` or
`APP_CLI_API_URL` override it for one invocation or one shell.

## `tenant`: `list`, `create`, `switch` 🏢 \{#tenant-list-create-switch}

`tenant` is the **staff** surface — the tenants you administer, not the tenants
you are a customer of.

```bash
pnpm --silent run cli tenant list
```

```text
acme	Acme Sp. z o.o.	(owner)
globex	Globex Corp	(admin)
```

```bash
pnpm --silent run cli tenant create Northwind Traders
# → created tenant: Northwind Traders (northwind-traders)
pnpm --silent run cli tenant switch globex
# → active tenant: Globex Corp (globex)
```

`tenant create` derives the slug from the name with `normalizeSlug` unless you
pass `--slug`, and makes you its owner. `tenant switch` first checks the slug
against your staff memberships and refuses locally with `not_found` (exit 5) —
"You do not administer any tenant with slug …" — before writing anything to
config; the selection lands in the active origin's profile, so each origin
remembers its own tenant.

## `todo`: `list`, `add` 📝 \{#todo-list-add}

The smallest complete vertical slice, and the one the smoke gate drives.

```bash
pnpm --silent run cli --tenant acme todo list
pnpm --silent run cli --tenant acme todo add Buy milk
```

```text
- Wdrożyć walking skeleton na produkcję  (todo-wal)
- Sprawdzić izolację danych między tenantami  (todo-ten)
added: Buy milk (9c2e04b7)
```

Ids are printed truncated to 8 characters — seeded rows carry readable literal
ids (`todo-walking-skeleton` → `todo-wal`), rows you create get UUIDs; `--json`
gives you the full row:

```json
{
  "ok": true,
  "data": {
    "todos": [
      {
        "id": "todo-walking-skeleton",
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

## `card`: `list`, `add`, `move` 🃏 \{#card-list-add-move}

Two boards share one substrate. `--board personal` (the default) has columns
`todo`/`doing`/`done` and no path rules. `--board team` is the *guarded* exemplar:
ordered columns `todo → in-dev → review → done`, with WIP limits of **3** on
`in-dev` and **2** on `review`.

```bash
pnpm --silent run cli card add Sketch the API
pnpm --silent run cli card list
pnpm --silent run cli card add Ship it --board team
pnpm --silent run cli card move <id> --board team --to in-dev
pnpm --silent run cli card list --board team
```

```text
added: Sketch the API [todo#0] (5b1f7ac9)
- [todo] Sketch the API  (5b1f7ac9)
added: Ship it [todo#0] (ae30c184)
moved: Ship it -> [in-dev#0] (ae30c184)
- [in-dev] Ship it  (ae30c184)
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

Team cards are also born in `todo` only — the entry column is a rule, not a
default, because a card spawned directly in `done` would have bypassed every
guard above.

```bash
pnpm --silent run cli card move <id> --board team --to done; echo "exit=$?"
# → error(validation): …done-only-from-review…
# → exit=2
```

## `member`: `list`, `ensure`, `update`, `remove`, `export` 👥 \{#member-list-ensure-update-remove-export}

Members are the tenant's **end customers** — a different concept from staff. The
whole group is staff-only.

### `member list` 📋 \{#member-list}

```bash
pnpm --silent run cli --tenant acme member list
```

```text
- alice@example.com	Alice Example  (member-a)  [vip, early-adopter]
- mag@example.com	Magic Link Member  (member-a)  [provisioned]
```

### `member ensure` ♻️ \{#member-ensure}

```bash
pnpm --silent run cli member ensure carol@example.com --name "Carol Example" --tag vip --tag beta
# → created: carol@example.com (…)      # run again → exists: carol@example.com (…)
```

Idempotent find-or-create keyed on email — the entry point a provisioning
integration calls.

### `member update` ✏️ \{#member-update}

```bash
pnpm --silent run cli member update <id> --name "Carol E." --tag vip
```

`--tag` **replaces** the whole tag set. `--clear-name` clears the display name
explicitly, which is why it is a separate flag from omitting `--name`.

### `member export` 📤 \{#member-export}

```bash
pnpm --silent run cli member export <id>
# → exported carol@example.com at 2026-07-26T09:31:02.004Z
```

The GDPR access/portability dump.

### `member remove` 🗑️ \{#member-remove}

```bash
pnpm --silent run cli member remove <id>
# → removed: <id> (members deleted: 1)
```

Deletes the member and their tenant-scoped data, leaving the global account
untouched.

## `staff`: `list`, `grant`, `revoke` 👑 \{#staff-list-grant-revoke}

Flat `owner`/`admin` grants — there is no organizations/teams concept in the
foundation. Listing is staff-readable; granting and revoking are **owner-only**.

```bash
pnpm --silent run cli staff list
```

```text
- demo@agentproofarch.dev	Demo User  (owner)
```

```bash
pnpm --silent run cli staff grant colleague@example.com
# → granted: colleague@example.com (admin)     # re-run → already staff: …
pnpm --silent run cli staff revoke --email colleague@example.com
# → revoked: … (grants removed: 1)
```

There are **no invitations**: the target must already have an account, and a
grant against an unknown email is `not_found` (exit 5). Revoking the last owner
is refused — the tenant cannot be left ownerless.

## `domain`: `list`, `add`, `check`, `remove` 🌐 \{#domain-list-add-check-remove}

Custom domains for the active tenant. Reading is staff-readable; add, check and
remove are owner-only. `domain add` and `domain check` print every DNS action
returned by the active provisioner. `--json` carries the same
`requiredDnsRecords` array without reformatting it.

**The transcripts below are the default.** `DOMAIN_PROVISIONER` is unset out of
the box, which selects the `noop` provisioner: it accepts every domain and
returns **no** DNS records, so no `Configure these DNS records` block is printed
at all. A real provisioner (`vercel`, `caddy`) is what puts records there — see
[the labelled provider example](#a-real-provisioner-observed) below.

```bash
pnpm --silent run cli --tenant acme domain list
```

```text
- acme.localhost	verified
(no DNS target configured)
```

The target line comes from `SELF_HOST_TARGET_CNAME`/`SELF_HOST_TARGET_IP`. A
self-host deployment sets exactly one; if both are present, the Caddy
provisioner prefers the CNAME. Provider-specific ownership challenges are not
part of this list response: they arrive from `domain add` and `domain check`.

A newly added domain starts **unverified**, so `add` reports it as pending. With
the default `noop` provisioner the required-record list is empty and the block is
omitted:

```bash
pnpm --silent run cli domain add shop.example.com
```

```text
attached: shop.example.com (pending)
```

`domain check` then asks the provisioner and persists the answer. The `noop`
provisioner accepts every domain, so the first check already verifies it — and
again prints no record block:

```bash
pnpm --silent run cli domain check shop.example.com
```

```text
shop.example.com: verified — shop.example.com accepted (noop provisioner)
```

```bash
pnpm --silent run cli domain remove shop.example.com
# → removed: shop.example.com (rows: 1)
```

Exit codes are unchanged: pending DNS is a successful check result (exit 0),
while authorization, validation and transport failures retain their taxonomy
codes.

### A real provisioner, as observed 🔎 \{#a-real-provisioner-observed}

:::note[Not the default output]
The block below is **not** what these commands print out of the box. It is the
shape a real hosting provider returns, and the record values are the ones
**observed against the production provisioner (`DOMAIN_PROVISIONER=vercel`)
during the owner-supervised live run on 2026-07-29** — the run written down in
[`docs/backlog.md` §US-020 live adjudication record](https://github.com/chomamateusz/agentproofarch/blob/main/docs/backlog.md#us-020-live-adjudication-record-2026-07-29).
Host and token are redacted to the documentation's example domain.
:::

That run attached a tenant subdomain under a parent already claimed by another
hosting account, so the response carried an ownership TXT challenge alongside
the pointing record:

```text
attached: shop.example.com (pending)

Configure these DNS records
TXT  _vercel.example.com  vc-domain-verify=shop.example.com,2b1f4d8a
  Purpose: ownership-verification
CNAME  shop.example.com  cname.vercel-dns.com
  Purpose: pointing
```

After the TXT was configured, `domain check` reported the remaining work rather
than collapsing the domain to a pending boolean, and a later check returned the
verified summary with no DNS block:

```text
shop.example.com: pending — shop.example.com is verified but Vercel reports its DNS as misconfigured

Configure these DNS records
CNAME  shop.example.com  cname.vercel-dns.com
  Purpose: pointing
```

The live run used subdomains only. For an **apex** such as `example.com` the
adapter emits `A  example.com  76.76.21.21` instead of the CNAME
(`adapters/domain-provisioning/vercel.ts`, covered by the offline suite) — that
branch was not part of the 2026-07-29 observation. The `caddy` provisioner
returns its configured `SELF_HOST_TARGET_CNAME` or `_IP` record until the DNS
lookup matches. See
[Self-host and domains](../operations/self-host-and-domains.md) for the
platform-subdomain and bring-your-own flows.

## `public`: `profile` 📣 \{#public-profile}

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

## Command reference 📋 \{#command-reference}

| Group | Commands |
|---|---|
| session | `health`, `register`, `login`, `login-link`, `logout`, `whoami` |
| `origin` | `list`, `use <url>` |
| `tenant` | `list`, `create <name...>` `[--slug]`, `switch <slug>` |
| `todo` | `list`, `add <title...>` |
| `card` | `list` `[--board]`, `add <title...>` `[--board] [--column]`, `move <id> --to <column>` `[--board] [--index]` |
| `member` | `list`, `ensure <email>` `[--name] [--tag…]`, `update <id>` `[--name] [--clear-name] [--tag…]`, `remove <id>`, `export <id>` |
| `staff` | `list`, `grant <email>`, `revoke --email` \| `--user-id` |
| `domain` | `list`, `add <domain>`, `check <domain>`, `remove <domain>` |
| `public` | `profile <tenant>` |
