---
title: ADR-0014 — Release versioning and version surfaces
sidebar_label: '🏷️ 0014 · Release versioning and version surfaces'
description: SemVer names application releases, the unprefixed HTTP API is additive-only v1, major releases freeze documentation, and five surfaces identify the build.
---

# ADR-0014 — Release versioning and version surfaces 🏷️ \{#adr-0014--release-versioning-and-version-surfaces}

**2026-07-28 · accepted (owner-approved).** Builds on [ADR-0003](./0003-vercel-environments.md), [ADR-0004](./0004-no-exceptions-enforcement.md), [ADR-0011](./0011-layout-layer.md), and [ADR-0012](./0012-per-origin-cli-profiles.md). → [full ADR on GitHub](https://github.com/chomamateusz/agentproofarch/blob/main/docs/decisions/0014-release-versioning-and-version-surfaces.md)

## Summary 📋 \{#summary}

The application now has one strict SemVer identity from `demo/package.json`,
bumped only by a dedicated release-cut pull request to `main` that the
owner-approved promotion then carries to production. Today's unprefixed
`/api/*` is the v1 contract and changes additively only; a breaking contract
starts `/api/v2` beside v1 and announces a deprecation window lasting at least
one later release. Architecture remains a sequence of immutable ADRs, not a
SemVer surface.

Every major release freezes the working documentation into a Docusaurus
snapshot. The browser console, public footer, login screen, settings page,
health routes, and CLI expose the release identity without inventing a checksum
or pretending the source-run CLI has a commit attestation.

## The WHY 🤔 \{#the-why}

The repository already served `0.1.0` through health, Sentry, and OTel while its
docs denied having release versions. A SHA identified a commit but gave users no
human release name, the SPA and CLI could not identify themselves, and the
published docs described `main` even when production lagged behind it.

The API evolution text also deferred the first external-consumer decision to a
menu of incompatible mechanisms. This ADR preserves the compiled-contract model
today and decides the future breaking-change mechanism before a live consumer
makes improvisation expensive.

## Decided ⚖️ \{#decided}

1. `demo/package.json` is the only application-version source. Major means a
   breaking external contract or foundation-level structural break; minor adds a
   capability; patch covers fixes, dependencies, docs, and refactors.
2. Promotion is the release event, and a dedicated `release/vX.Y.Z` pull request
   to `main` — opened immediately before it, carrying nothing else — is the only
   diff that may bump the version. `pnpm run release -- <bump>` updates the
   manifest, inserts a changelog marker, and freezes docs on a major. It never
   commits, tags, or pushes. The promotion pull request then carries that diff to
   `production`, and `tag-release` tags the merged `production` commit and
   refuses to move an existing tag. The manifest stays `0.1.0` until the first
   `release/v1.0.0` cut.
3. Unprefixed `/api/*` is v1 and additive-only. A breaking change introduces
   `/api/v2` alongside v1, with the removal date announced when v2 ships and at
   least one subsequent release before v1 removal. No `/api/v1` alias or v2
   machinery exists today.
4. Accepted ADRs are immutable. Later decisions append a dated note or supersede
   them explicitly; application majors do not version architecture.
5. `website/docs/**` is **Next**. The release-cut pull request for a major
   freezes `website/versioned_docs/version-<major>.x/`, which becomes the
   released documentation, and adds the navbar version dropdown that selects it.
6. Version surfaces are closed and named:

| Surface | Shows | Source |
|---|---|---|
| `/api/health*` | unchanged `version` and `sha` | manifest + deploy attestation |
| browser console | version, short SHA, docs URL | build-time constants |
| footer and login | version and short SHA | build-time constants, no fetch |
| settings | browser/server version and SHA, links, stale warning | health query |
| CLI | `--version` and `version` | manifest; no commit SHA |

The health response gains no `checksum`: no checksum artifact exists. The CLI
reports no SHA because it runs through `tsx` without a build attestation;
`health` remains the way to read the server SHA.

## Consequences \{#consequences}

| Rule | TYPE | LINT | TEST | REVIEW+AI |
|---|---|---|---|---|
| One version source | n/a | n/a | strict-SemVer server test; surfaces read the manifest | reject hardcoded copies |
| Bump only at the release cut | n/a | n/a | n/a | the release-cut PR owns the bump; tags never move |
| Additive-only v1 | contract schemas protect current consumers | n/a | contract tests | primary tier for external compatibility |
| Breaking change means v2 + window | n/a | n/a | n/a | only tier until v2 exists |
| Layout structure stays pure | n/a | depcruise + boundaries | existing layout probe | prevent the stamp growing a fetch |
| Console banner is bootstrap-only | n/a | `no-console`, scoped to `main.tsx` | config-regression probe | — |
| Major docs snapshot | n/a | n/a | n/a | the major release-cut PR contains the snapshot and its dropdown |

Four residuals remain explicit:

- a local gate cannot tell a release-cut branch from an ordinary `main` pull
  request that bumps the version;
- a breaking rename applied consistently to every in-repo consumer can pass all
  gates, so external compatibility remains a review judgment;
- without `APP_COMMIT_SHA`, the stamp shows only the version and makes no SHA
  claim;
- a frozen snapshot does not receive later documentation fixes automatically.
