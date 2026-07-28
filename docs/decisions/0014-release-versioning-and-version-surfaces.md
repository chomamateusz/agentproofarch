# ADR-0014: SemVer for the app, an additive-only v1 API, and the surfaces that show them

Date: 2026-07-28 · Status: accepted (owner-approved) · Builds on
[ADR-0003](0003-vercel-environments.md) (promotion is the release event),
[ADR-0004](0004-no-exceptions-enforcement.md) (a promise in prose maps to an
enforcer), [ADR-0011](0011-layout-layer.md) (layouts are structure only) and
[ADR-0012](0012-per-origin-cli-profiles.md) (the neutral `APP_` env family).

## Context

**This repository has been denying release versions in three places while
serving one.** `demo/package.json` carries `0.1.0`, every health response has
carried it as `version` since the attestation landed, Sentry reports it as the
release and OTel as `service.version` — and at the same time the changelog
preamble says the project "carries **no release version numbers**", the landing
page says "there is no release versioning either", and the architecture says
"**No version namespace, no version header, no content negotiation**". The
number was real, unmentioned in any procedure, and never bumped.

That was defensible while nothing was released. It stopped being defensible at
the first promotion. Three concrete pressures forced the decision:

1. **A promotion is a release, and a release with no name cannot be discussed.**
   The runbook already treats the `main → production` merge as the release event
   and already teaches the owner to read the released SHA off `/api/health`. A
   SHA answers *which commit*; it does not answer *what changed for a user* or
   *is this the build I approved on Tuesday*. Reading a 40-character hex string
   is not a substitute for a name a human can hold.
2. **"Which build am I looking at?" has no answer in the product.** Nothing in
   the SPA, the login screen or the CLI states its own identity. The one place
   the truth is visible is a JSON route a non-technical user will never call —
   and the one failure class this repo has actually suffered
   (the 2026-07-12 stale-`dist/web` incident) is precisely a *client that is
   older than the server it is talking to*. The bundle knows what it is; it just
   never says so.
3. **The published documentation is a single moving snapshot.** Every reader of
   the docs site reads `main`. The day a promoted release differs from `main` —
   which is the normal steady state, because `main` is staging — the site
   documents software nobody is running.

**Three different things are versioned here, and conflating them is what made
the old text incoherent.** The *application release* changes on every promotion.
The *HTTP API contract* changes far more slowly, and its consumers are not the
same population. The *architecture* does not have versions at all — it has
decisions. One mechanism each, named separately, is the whole shape of this ADR.

The API half has a second, sharper edge. The existing rule — no `/v1`, because
server, web and CLI compile from one commit — **is still correct today and is not
being repealed.** What was missing is what happens when it stops being correct:
the current text answers "introduce explicit versioning; cheapest first: a dated
capability field, then a `/v1` prefix, then `Accept-Version`" — an *unranked menu
handed to whoever is on shift* at the exact moment (a live external consumer)
when improvising is most expensive. A decision that defers the decision is not a
decision.

## Decision

1. **The application version is SemVer, and `demo/package.json`'s `version` is
   its single source.** No `VERSION` file, no second constant, no hardcoded
   string anywhere. `apps/server/src/version.ts` remains the one reader on the
   server; every other surface derives from the same manifest at build time. The
   website's `package.json` stays an inert `0.0.0` — the docs site is not the
   product and does not carry the product's version.

   - **major** — a breaking change to a contract someone outside this commit
     depends on (see Decision 3), or a structural change that takes a fork off
     the foundation in the ADR-0004 sense.
   - **minor** — a new capability: a route, a CLI command, a page, an operational
     mechanism.
   - **patch** — fixes, dependency bumps, documentation, refactors.

   A **TEST-tier enforcer** backs the claim: `apps/server/src/version.test.ts`
   asserts `APP_VERSION` matches strict SemVer, so a non-SemVer manifest fails
   `check` rather than reaching a health response.

2. **The version is bumped ONLY by a dedicated release-cut pull request to
   `main`, opened immediately before promotion.** An ordinary feature pull
   request never touches `version`, and neither does the promotion PR itself. The
   cut is its own branch — `release/vX.Y.Z`, branched from the `main` tip that is
   about to be promoted — and its diff contains **nothing but** the manifest
   bump, the changelog marker and, on a major, the documentation snapshot. Once
   that PR is merged, the ordinary `main → production` promotion PR carries the
   bump to production and is reviewed under the same owner approval as everything
   else in that diff (ADR-0003's seam defense); after the merge the `tag-release`
   workflow tags the released commit. Splitting the cut from the promotion keeps
   the promotion diff readable as "what changed for a user" rather than mixing
   release bookkeeping into it, and keeps `main` and `production` agreeing on the
   version at every moment either is deployed. Consequences that follow, and are
   decided here rather than left to habit:

   - **The changelog gains version markers.** Entries keep being written under
     the UTC merge date of their pull request — nothing changes for a
     contributor. In the release-cut PR, `pnpm run release` inserts a single
     `## vX.Y.Z — YYYY-MM-DD` heading above the newest date section. Everything
     between one marker and the next shipped in that release. **No existing entry
     is ever rewritten**, which is what makes the operation safe to automate.
   - **The released commit is tagged `vX.Y.Z` on `production`**, by a workflow,
     idempotently, and only if the tag is absent. A tag is never moved: an
     existing tag pointing at a different commit is a **failed run**, not a
     silent force-update. The tag is a convenience index into history, never the
     source of truth — the manifest in the commit is.
   - **The first release cut is `v1.0.0`.** `0.1.0` is the pre-release identity
     of something that has never been released, and the manifest keeps it —
     including in the pull request that accepts this ADR — until the first
     `release/v1.0.0` cut runs `pnpm run release -- major`. The first thing to
     reach production under this ADR is 1.0.0, and the SemVer promises in
     Decision 3 begin there.

3. **API stability contract: today's unprefixed `/api/*` IS v1, and inside v1 the
   HTTP API changes additively only.** This is a **policy and contract decision
   only — no versioning machinery is built, and nothing is renamed.** In
   particular no `/api/v1` alias is introduced: adding one would itself be the
   breaking change the policy exists to prevent.

   - **Additive-only within v1**, on exactly the terms
     [architecture.md §API versioning](../architecture.md#api-versioning-and-contract-evolution)
     already sets and this ADR does not weaken: new request fields optional with
     a server default; new response fields pure additions; a shipped field's
     name, type and meaning immutable; enum widening is a breaking change for
     readers; every rename/removal/retype is expand → contract over two deploys.
   - **A breaking change requires a new `/api/v2` prefix**, both versions mounted
     simultaneously, with a **deprecation window announced in the CHANGELOG and
     on the versioning page when v2 ships and lasting at least one subsequent
     release** before v1 is removed. The window's end is announced before it
     starts; a v1 route is never deleted in the release that introduces its v2
     replacement.
   - **What this supersedes**: the "cheapest first: additive-only with a dated
     capability field; then a `/v1` URL prefix per major; then per-request
     `Accept-Version`" ladder in architecture.md §API versioning and on the
     errors-and-API-versioning page. The **trigger is unchanged** — the first
     external consumer not built from this commit — but the answer is now
     decided in advance and is the URL prefix, not a menu. Capability fields and
     `Accept-Version` are **rejected**, with reasons, in Decision 8.
   - **Why a policy with no machinery is worth writing down**: today web, CLI and
     server ship from one commit, so the policy protects nobody yet. It exists
     so that the day an external consumer appears, the compatibility promise is
     already a rule the codebase was held to for months — rather than a
     retrofit onto a surface that drifted while nobody was promising anything.

4. **Architecture versioning stays ADRs, and this is stated rather than assumed.**
   Architecture decisions are not released, so they are not SemVer. An ADR is
   **immutable once accepted**: it is never rewritten to reflect a later opinion.
   It changes only by (a) a dated note appended to it, or (b) a later ADR that
   supersedes it and says so, with both documents linking to each other.
   **An ADR number is not a version, and the application's major version says
   nothing about the architecture.** Shipping v2.0.0 does not renumber, retire or
   revalidate a single ADR.

5. **The documentation site cuts a versioned snapshot per MAJOR promotion**, using
   Docusaurus's own versioned-docs mechanism — no second site, no second
   toolchain. `website/docs/**` remains the working copy and is published as
   **Next**; `website/versioned_docs/version-<major>.x/` is the frozen snapshot a
   reader of the released software gets by default. The **1.x snapshot is cut in
   the `release/v1.0.0` pull request to `main`** described in Decision 2, by the
   same script that bumps the version, so the snapshot is provably the
   documentation of the commit being promoted. That same pull request adds the
   `docsVersionDropdown` navbar item: a version selector is a false claim until
   there is a snapshot to select, so it cannot land before the cut.
   Minor and patch releases do **not** cut a snapshot: a snapshot per patch would
   be an archive nobody reads, maintained forever.

6. **Five version surfaces, each with a named owner and a named enforcer.** The
   list is deliberately closed; anything not on it does not display a version.

   | Surface | What it shows | Where it comes from |
   |---|---|---|
   | **`/api/health*`** | unchanged `{ version, sha }` | already implemented; only the *value* changes |
   | **Browser console, on boot** | `agentproofarch vX.Y.Z (abc1234) · docs <url>` | `apps/web/src/main.tsx`, one line |
   | **Public footer + login screen** | a discreet `vX.Y.Z (abc1234)` | a build-time constant, no fetch (Decision 7) |
   | **Settings, for signed-in users** | version, sha, changelog + docs links, **and a live comparison against `/api/health`** with a stale-bundle warning | a feature component, TanStack Query |
   | **CLI** | `--version` flag and a `version` command | `demo/package.json`, same manifest |

   Two honesty constraints ride on this table and are part of the decision:

   - **The health attestation's shape is not broken.** `version` and `sha` keep
     their names and meanings, and the `EXPECTED_SHA` equality that
     `post-deploy-smoke` depends on is untouched. **No `checksum` field is
     added.** This repository has no build checksum artifact; the commit SHA *is*
     the build identity, and inventing a second one so that a settings panel can
     display three words instead of two would be a fabricated guarantee.
   - **The CLI reports no commit SHA.** It runs from source through `tsx` and has
     no build step, therefore no build attestation. `agentproofarch --version`
     prints the version and nothing else; the SHA a user needs is the *server's*,
     and `agentproofarch health` already prints it.

7. **The footer and login stamps are build-time constant text; the live
   comparison is a feature.** This is the ADR-0011 constraint, honoured
   explicitly rather than worked around:

   - The stamp is a presentational atom under `components/ui/`, rendering a
     string that a Vite `define` froze at build time. It performs no fetch, holds
     no state, knows no domain type and takes no props.
   - `components/layout/AppShell` renders it in a footer region it owns.
     **This is legal by ADR-0011 rule (a) as written and as enforced** —
     `web-layouts-are-structure-only` and the ESLint boundaries matrix both
     permit `components/layout → components/ui`. The alternative (a `footer`
     slot filled by `AppLayout`) is **rejected**: `AppLayout` is the `web-shell`
     element, whose boundaries entry does not permit `web-ui`, so that route
     would require *widening a layer rule* to render a version string. Choosing
     the placement the existing rules already allow is the point.
   - **The `/api/health` comparison lives in `features/settings/`**, where
     TanStack Query is legal. No layout component ever gets a query, and rule (a)
     stays exactly as strong as ADR-0011 left it.
   - **The console banner lives in `main.tsx`**, the app bootstrap. It needs a
     scoped `no-console` exception on that one file — the same shape as the
     existing exception for `apps/server/src/entry.*.ts` (the composition-root
     startup path). It is a *scoped* exception on a bootstrap file, not a
     relaxation: a `console.log` anywhere else in `apps/web` still fails
     `check`, and a config-regression probe proves it.

8. **Explicitly rejected, with reasons.**

   | Rejected | Why |
   |---|---|
   | **A root `VERSION` file** as the single source | `demo/package.json` is already read by the server, by Sentry and by OTel, and `pnpm` treats it as authoritative. A second file would be a source of truth that tooling ignores — the exact drift this ADR exists to end. |
   | **Bumping the version on every merge to `main`** | `main` is staging. A version that changes without a release names nothing, and the number a user reports would not correspond to anything the owner approved. |
   | **`0.x` forever** | `0.x` communicates "no compatibility promise". Decision 3 makes a compatibility promise. Keeping `0.x` while promising stability is the incoherence this ADR is fixing, moved one level down. |
   | **A dated capability field** (`{ apiCapabilities: [...] }`) as the escalation | It versions *features* rather than the *contract*, so a consumer must branch per capability forever and every reader carries the union of all historical shapes. It also cannot express a removal, which is the case that actually breaks people. |
   | **`Accept-Version` header negotiation** | Invisible in a URL, unloggable without extra plumbing, uncacheable without `Vary` discipline, and impossible to reproduce with `curl` from a bug report. The URL prefix is the version a support conversation can actually say out loud. |
   | **A snapshot per minor/patch release** | An archive of dozens of near-identical doc trees, each of which the `onBrokenLinks: 'throw'` build must keep green forever. Majors are where a reader genuinely needs the old text. |
   | **Adding a `checksum` field to the health attestation** | No such artifact exists to report. See Decision 6. |
   | **A push-based "new version available" channel** | Already rejected on the errors-and-API-versioning page (the Vercel target has no resident channel), and unchanged here. The settings comparison is a *pull* on a page the user opened. |
   | **Publishing to npm / semantic-release / conventional commits** | `demo/package.json` is `private: true` and nothing is published. A commit-message-driven release machine would infer the bump the owner is supposed to decide, at the one moment this architecture insists a human reads the diff. |

## Consequences

- **Three documents stop lying, in the same pull request that makes them wrong.**
  The `CHANGELOG.md` preamble, the landing page's "not a package" admonition and
  architecture.md §API versioning are rewritten here, not later — the repo
  convention is that a behaviour-visible change updates `website/docs` and
  `CHANGELOG.md` in its own PR, and this change's most visible behaviour is a
  claim about itself.
- **The API decision is a *narrowing*, not a reversal.** Nothing that is true
  today stops being true: there is still no `/v1`, still no version header, still
  no content negotiation, and the compiled contract is still the version. What
  changed is that the escalation path is now one named answer instead of three
  ranked options. Any future author who wants `Accept-Version` must supersede
  this ADR to get it.
- **`docs/deploy-promotion.md` gains two steps and the release stops being
  hand-work.** `pnpm run release -- <major|minor|patch>` bumps the manifest,
  inserts the changelog marker and (on a major) cuts the docs snapshot; the
  `release/vX.Y.Z` pull request to `main` carries that diff; the promotion PR
  carries it to `production`; a `tag-release` workflow tags `production` after
  the merge. The script **never commits, never tags, never pushes** — the human
  gate stays exactly where ADR-0003 put it.
- **The web bundle gains two build-time constants and one query.** `__APP_VERSION__`
  and `__APP_COMMIT_SHA__` come from a Vite `define` fed by the same manifest;
  the settings comparison is the only version surface that touches the network,
  and it reuses the health route that already exists.
- **`pnpm run check` grows, it does not shrink.** New assertions land on the
  health attestation, the SemVer format of `APP_VERSION`, the footer stamp on two
  rendered surfaces, the CLI's `--version` and `version`, and the changelog/
  manifest rewriting helpers. One config-regression probe is added, so the scoped
  `no-console` exception is proven scoped. doc-lint pins the test-file and
  config-regression counts on three documentation surfaces, so those numbers are
  re-stated in this pull request or `check` fails.
- **doc-lint learns that a frozen snapshot is frozen.** Its injected-count check
  runs over every tracked `.md`, so a committed `versioned_docs/` snapshot would
  fail the gate the first time a test is added after the cut. The count check
  therefore skips `website/versioned_docs/`, while the delimiter and dead-link
  checks continue to cover it. **This is a correctness fix to the checker, not a
  weakened gate**: the live pages, which are the ones that can mislead a reader
  about the current tree, remain fully pinned by `REQUIRED_COUNT_TOKENS`.
- **Visual baselines are re-rendered once, in this pull request.** `AppShell`
  gains a footer region and the login card gains a stamp under its fine print, so
  every affected `linux` PNG is re-authored by the `visual-baselines` workflow on
  this branch. The stamp itself is masked in the visual specs, so a future
  version bump can never redden the pixel suite — a version string is by
  definition a value that changes, and pinning it in a screenshot would
  manufacture the flake class the flake doctrine forbids.
- **Enforcement, honestly tiered.**

  | Rule | TYPE | LINT | TEST | REVIEW+AI |
  |---|---|---|---|---|
  | One version source (`demo/package.json`) | n/a | n/a | `version.test.ts` asserts strict SemVer; the web/CLI surfaces derive from the same manifest and their tests read it back | that a new surface derives rather than hardcodes |
  | Version bumped only by the release cut | n/a | n/a | n/a — no local check can tell a release-cut branch from an ordinary one | the `release/vX.Y.Z` PR to `main` is the only diff that may touch `version`; the tag workflow refuses to move an existing tag |
  | Additive-only within v1 | the contract's zod schemas: a removed/retyped field fails every consumer's `check` at once | n/a | contract tests over the route schemas | **the primary tier** — a rename that *is* applied to all three consumers typechecks fine; only review catches that it broke an external reader |
  | Breaking change ⇒ `/api/v2` + announced window | n/a | n/a | n/a — no v2 machinery exists to test | the only tier, and it is named as such |
  | Layouts stay structure-only | n/a | `web-layouts-are-structure-only` (depcruise) + the boundaries matrix, both unchanged | the `layoutDir` config-regression probe, unchanged | that a stamp never grows a fetch |
  | Console banner is bootstrap-only | n/a | `no-console` still errors across `apps/web`, excepted on `main.tsx` alone | a config-regression probe asserts `no-console` still fires elsewhere in `apps/web` | — |
  | Docs snapshot per major | n/a | n/a | n/a | the release-cut PR for a major must contain `versioned_docs/version-<n>.x/` and the navbar dropdown that selects it |

- **Four residuals stay open and named.** (a) **Nothing mechanical prevents a
  version bump on an ordinary `main` PR** — only the release-cut PR may carry
  one, and that is a review-tier rule, stated as such. (b)
  **The additive-only promise is REVIEW+AI-tier for the case that matters**: a
  breaking rename applied consistently to server, web and CLI is green on every
  gate, because all three ship from one commit; only a reader outside the commit
  would notice, and there is none to notice yet. (c) **The stamp's SHA is
  `unknown` wherever `APP_COMMIT_SHA` is unset** — local builds, and any deploy
  target that forgets to wire it — exactly as the health attestation already
  behaves; the stamp degrades to `vX.Y.Z` with no SHA rather than printing a
  reassuring lie. (d) **The docs snapshot freezes at the moment of the cut**, so
  a documentation fix after a release reaches Next and not the snapshot until the
  next major; back-porting a doc fix into `versioned_docs/` is a manual edit, and
  no mechanism forces it.
