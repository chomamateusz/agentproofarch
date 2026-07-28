---
title: Versioning & releases
sidebar_label: 🏷️ Versioning & releases
description: The application SemVer, additive-only API contract, promotion ritual, documentation snapshots, and every build-identity surface.
---

# Versioning & releases 🏷️ \{#versioning--releases}

## Three things are versioned, and only one is SemVer \{#three-things}

| Thing | Mechanism | Meaning |
|---|---|---|
| application | SemVer | the release promoted to production |
| HTTP API | stability contract | unprefixed `/api/*` is additive-only v1 |
| architecture | ADRs | immutable decisions, not releases |

An application major says nothing about ADR numbering. An ADR changes only by a
dated note or a later ADR that explicitly supersedes it.

## The app version \{#the-app-version}

`demo/package.json` is the single source. The server, web build, CLI, Sentry, and
OTel derive from that manifest; `website/package.json` remains an inert `0.0.0`
because the docs site is not the product.

| Bump | Use it for |
|---|---|
| major | a breaking external contract or foundation-level structural break |
| minor | a new route, command, page, or operational capability |
| patch | a fix, dependency update, documentation change, or refactor |

Only one kind of pull request may change the version: the release cut described
below. Ordinary feature work never touches it, and the manifest stays `0.1.0`
until the first cut. `v1.0.0` will be the first release under this contract.

## The release procedure \{#the-release-procedure}

A release is cut on its own branch, `release/vX.Y.Z`, taken from the `main` tip
that is about to be promoted. From `demo/` on that clean branch:

```bash
pnpm run release -- <major|minor|patch>
```

The command bumps `demo/package.json`, inserts a `## vX.Y.Z — YYYY-MM-DD`
changelog marker, and cuts a documentation snapshot on a major. It does not
commit, tag, or push. Review and commit that diff — and nothing else — then:

1. merge the `release/vX.Y.Z` pull request into `main`;
2. open the owner-approved `main → production` promotion pull request, which
   carries the bump to production.

After that merge, `tag-release` creates `vX.Y.Z` at the production commit. A
repeat run is harmless when the tag already points there and fails if the tag
points anywhere else. The owner-side sequence is in the
[release runbook](https://github.com/chomamateusz/agentproofarch/blob/main/docs/deploy-promotion.md).

## The API stability contract \{#the-api-stability-contract}

Today's unprefixed `/api/*` is v1. Within v1:

- new request fields are optional and have server defaults;
- response fields are additions only;
- a shipped field's name, type, and meaning do not change;
- widening an enum is breaking for exhaustive readers;
- rename, removal, and retype use expand → contract over two deploys.

The detailed rules remain on [Errors & API versioning](../architecture/errors-and-api-versioning.md).
A breaking change introduces `/api/v2` mounted beside v1. The changelog and this
page announce the deprecation window when v2 ships, including its end, and v1
remains for at least one subsequent release. No v2 machinery exists today and
no `/api/v1` alias is introduced.

## Documentation snapshots \{#documentation-snapshots}

`website/docs/**` is the working copy published as **Next**, and it is the only
docs version this site currently serves. The release cut for a major will freeze
it into `website/versioned_docs/version-<major>.x/` and add the navbar version
dropdown in the same pull request, after which the released major becomes the
default docs version; until that cut exists there is nothing to select and no
dropdown is shown. Minor and patch releases will not create near-identical
archives. A documentation fix made after a cut reaches Next, not the frozen
snapshot, unless someone backports it manually.

## Where the version shows up \{#where-the-version-shows-up}

| Surface | What it shows | Owner |
|---|---|---|
| `/api/health*` | unchanged `{ version, sha }` | server attestation |
| browser console at boot | `agentproofarch vX.Y.Z (abc1234) · docs <url>` | web bootstrap |
| public footer and login | discreet `vX.Y.Z (abc1234)` | build-time UI atom |
| settings | browser and server version/SHA, links, stale warning | settings feature + health query |
| CLI | `--version` and `version` | manifest |

There is no `checksum` field: the repository has no checksum artifact, and the
commit SHA already names the build. The CLI reports no SHA because it runs from
source without a build step; `agentproofarch health` reports the server's SHA.
When `APP_COMMIT_SHA` is unset, the browser stamp omits the SHA instead of
printing `unknown` as if it were an attestation.

## What is not versioned \{#what-is-not-versioned}

The documentation site's own `package.json` stays `0.0.0`. Architecture is not
SemVer either: accepted ADRs remain immutable records, with later changes
expressed by dated notes or explicit superseding ADRs.
