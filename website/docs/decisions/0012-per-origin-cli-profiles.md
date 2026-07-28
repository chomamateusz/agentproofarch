---
title: ADR-0012 — Per-origin CLI profiles
sidebar_label: '🍪 0012 · Per-origin CLI profiles'
description: CLI credentials and tenant selection are scoped to API origins, with explicit precedence and lossless migration from the legacy global profile.
---

# ADR-0012 — Per-origin CLI profiles: client state scoped like browser cookies 🍪 \{#adr-0012--per-origin-cli-profiles-client-state-scoped-like-browser-cookies}

**2026-07-27 · accepted (owner-approved).** Builds on [ADR-0004](./0004-no-exceptions-enforcement.md) (a promise in prose maps to an enforcer) and [ADR-0003](./0003-vercel-environments.md) (the client routinely targets more than one deployment). → [full ADR on GitHub](https://github.com/chomamateusz/agentproofarch/blob/main/docs/decisions/0012-per-origin-cli-profiles.md)

## Summary 📋 \{#summary}

The CLI keeps one credential and tenant profile per canonical API origin instead of one machine-global profile. Flags and CLI-specific environment variables select an origin or tenant without introducing a token environment variable; inside this checkout, ordinary commands default to the local dev server. Legacy config migrates automatically into the version-2 origin map.

## The WHY 🤔 \{#the-why}

The old `~/.config/agentproofarch/config.json` held one `apiUrl`, token and tenant for the whole machine. A login against a deployment replaced the local profile, so a later quickstart command with no `--api-url` could silently read from or write to that deployment while the operator believed it was targeting localhost.

That is a correctness defect in the state model. A browser scopes cookies by origin, and a CLI that targets localhost, previews, staging and production needs the same isolation property. Documentation asking every reader to reset `HOME` or repeat a flag cannot prevent a silent wrong-instance write.

## Decided ⚖️ \{#decided}

### 1. Profiles are keyed by canonical origin 🌍 \{#1-profiles-are-keyed-by-canonical-origin}

The config remains at `~/.config/agentproofarch/config.json`, mode `0600`, but its version-2 shape is an origin-keyed map plus `currentOrigin`:

```json
{
  "version": 2,
  "currentOrigin": "http://localhost:47100",
  "profiles": {
    "http://localhost:47100": {
      "token": "…",
      "tenant": "acme"
    },
    "https://agentproofarch.vercel.app": {
      "token": "…",
      "tenant": null
    }
  }
}
```

Keys use the WHATWG origin: scheme, host and port, canonicalized with default ports removed. `origin list` shows configured origins and only whether each token is present; `origin use <url>` changes `currentOrigin` without a network call.

### 2. Selection has explicit precedence 🪜 \{#2-selection-has-explicit-precedence}

```text
--api-url  >  APP_CLI_API_URL  >  checkout-local default  >  currentOrigin
--tenant   >  APP_CLI_TENANT   >  selected profile tenant
```

The token always comes from the resolved origin's profile. There is deliberately no token environment variable: sessions are written and refreshed by the CLI, while environment variables spread to child processes and logs.

Inside a checkout whose `package.json` identifies `agentproofarch`, the default API URL is `http://localhost:47100`. That rung outranks a stored deployment so an unqualified quickstart command cannot silently target an earlier selection. Deliberately targeting another instance from the checkout requires `--api-url` or `APP_CLI_API_URL`.

### 3. Writes affect only the active origin ✍️ \{#3-writes-affect-only-the-active-origin}

`login`, `register` and `login-link --link` store credentials for the resolved origin; `tenant switch` stores that origin's tenant. `logout` attempts server-side revocation and clears the active origin's local token even if revocation fails. Other origin profiles remain unchanged.

Flag- or environment-selected config writes move `currentOrigin`; the checkout-local default and read-only commands do not. `origin use` is always an explicit selection.

### 4. Legacy config migrates automatically 🔁 \{#4-legacy-config-migrates-automatically}

The first read of the legacy `{ apiUrl, token, tenant }` shape rewrites it losslessly into version 2, using the legacy URL's canonical origin as both the profile key and `currentOrigin`. The write uses a mode-`0600` sibling temporary file followed by an atomic rename.

Migration writes one notice to stderr so `--json` still emits one document on stdout. Malformed or corrupted known formats fail without rewriting the file; an unknown future version is left untouched.

## Alternatives considered 🔀 \{#alternatives-considered}

| Alternative | Verdict | Why |
|---|---|---|
| Keep one global profile and harden the docs | rejected | A review-tier ritual cannot prevent a silent wrong-instance write. |
| Store config in each checkout | rejected | It puts bearer credentials inside a working tree, one accidental add away from source control. |
| User-named or environment-named profiles | rejected | A label adds another mapping that can drift; the origin is already the deployment's identity. |
| Add `APP_CLI_TOKEN` | rejected | The CLI could neither safely persist a re-issued token nor clear the environment on logout, and tokens would leak more readily into process trees and logs. |
| Detect the checkout through git or its directory name | rejected | Both fail for supported renamed, copied or worktree checkouts; parsing the package name works without spawning a process. |

## Consequences ⚡ \{#consequences}

- Local and deployed sessions coexist without overwriting one another.
- Quickstart commands issued inside the repository target the local server unless the operator explicitly selects another URL.
- Existing smoke drivers remain deterministic because they pass `--api-url` on every invocation and isolate their config homes.
- The config schema, resolver tests and migration tests mechanically cover the profile shape, precedence ladder, isolation and stdout-clean migration.

:::caution[Honest caveats]
- Origin keys discard any path component, so a deployment mounted below a path must be supplied by flag or environment on each invocation.
- Concurrent writers remain last-writer-wins; the config file has atomic replacement but no lock.
- Tokens remain plaintext in a mode-`0600` file rather than an operating-system keychain.
:::
