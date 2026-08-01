# ADR-0013: The visual review loop — a GitHub-native gallery and an approval that commits

Date: 2026-07-27 · Status: accepted (owner-approved) · Extends
[ADR-0008](0008-visual-regression.md) (the capture and the comparison; that ADR
is a historical record and is not edited into agreement with this one) and
builds on [ADR-0004](0004-no-exceptions-enforcement.md) (a promise in prose maps
to a mechanism) and the CHEAP SECRETS doctrine (`architecture.md` §Security —
every long-lived token in CI is a cost, not a configuration detail).

## Context

**ADR-0008 built everything except the part a human touches.** The pixels are
captured deterministically, compared exactly, and stored in git — and then the
review of a difference is: open the Actions run, download a zip artifact, unzip
it, open PNGs in a local image viewer, decide, dispatch `visual-baselines` with
`update: true`, wait, download a *second* zip, unzip it, copy seven files into
the working tree, commit. Nine manual steps, none of them inside the pull request
the change lives in, all of them off the surface where every other review
decision on this repo is made.

That gap has a shape worth naming: `visual` is the only job in the pipeline whose
output cannot be read where it is produced. `check`, `smoke`, `e2e` and
`docker-smoke` fail with a log line that says what broke. A red `visual` says
"three pixels differ" and hides the only evidence that matters behind a zip.

**A market evaluation (2026-07-27) asked whether a vendor closes it.** Argos,
Visual Regression Tracker, Chromatic, Lost Pixel, Percy and Vizzly were checked
against two hard constraints — capture stays ours (no second render farm), and
git stays the single baseline store. The finding that decided the ADR is
structural, not commercial:

> Every service in this category keeps **its own** baseline store, computed from
> a build of a reference branch. Clicking "Approve" in a vendor's UI updates
> **their** baseline. It never writes a PNG into this repository.

So a vendor's approval is a social signal layered on top of the ADR-0008
two-step PR, not a replacement for it — the dispatch-and-commit still has to
happen afterwards, by hand. Paying (in money, in a long-lived token, or in a
self-hosted service) for a nicer gallery that leaves the loop open is the wrong
trade.

**Meanwhile the best reviewer in the evaluation is already installed.** GitHub
renders a committed PNG change in the Files tab with 2-up, swipe and onion-skin
modes. A baseline that lands as a commit is reviewed with a purpose-built image
diff, in the PR, by anyone with a browser, with no account anywhere. The missing
piece was never the viewer — it was getting the bytes in front of a human before
the decision, and turning the decision back into a commit afterwards.

One market finding also retires an ADR-0008 alternative on new grounds:
**Lost Pixel is being sunset** (repository archived 2026-04-22, last code release
2024-11-14, "the Lost Pixel team is joining Figma", no shutdown date published
while the pricing page still advertises a free tier).

## Decision

### 1. The review surface is GitHub itself — CI publishes the gallery into the PR

When the `visual` job detects differences, CI publishes Playwright's own three
PNGs per changed screenshot — `*-expected.png`, `*-actual.png`, `*-diff.png`,
already written into `demo/test-results/` — to an **unprotected utility branch**
and posts **one** pull-request comment containing them inline.

- **The publisher never runs pull-request code.** `ci.yml` gains a second job,
  `visual-report` (`needs: visual`, `if: always()`), which checks out the PR's
  trusted base SHA, never its head, and downloads the existing `visual-diff`
  artifact on failure. Its untrusted inputs are PNG bytes and a PR number. The
  job also runs after a green comparison so an existing gallery comment can be
  updated to "no visual changes". The job that builds and runs the app
  keeps `contents: read`; only this one holds `contents: write` +
  `pull-requests: write`, and it holds them in a job where there is no
  PR-authored code to execute.

- **File names from the artifact are untrusted input** — a spec title becomes a
  path, and a pull request may add specs. The job copies only entries matching
  `^[A-Za-z0-9._-]+-(expected|actual|diff)\.png$`, flattened, never preserving
  directory components from the artifact.

- **Branch and path:** `visual-reports`, laid out as
  `pr-<number>/run-<id>/<name>-{expected,actual,diff}.png`. The run ID is
  in the path on purpose: `raw.githubusercontent.com` caches by URL, so reusing
  one path per PR would show a maintainer the *previous* run's image for
  minutes. A new commit is a new URL, and a new URL cannot be stale.

- **The branch is bounded, not accumulating.** Each publication rewrites
  `visual-reports` as a **single root commit** (orphan, force-pushed) containing
  the directories of currently open pull requests only, so a closed PR's images
  leave the repository with the next publication and the branch carries no
  history to grow. A `concurrency: { group: visual-reports, cancel-in-progress:
  false }` serialises publications so two PRs cannot lose each other's push.

- **Nothing runs off that branch.** `ci.yml` triggers on `pull_request` and on
  pushes to `main` only; Pages is published by `docs-deploy.yml` through
  `actions/deploy-pages`, not from a branch. A push of PNGs to `visual-reports`
  therefore starts no workflow and serves no site — it is a blob store that
  happens to be a ref.

- **The comment is upserted, never repeated.** It carries a hidden marker
  (`<!-- visual-review-gallery -->`); the job lists the PR's comments, edits the
  one bearing the marker if it exists and creates it otherwise. A PR with six
  red visual runs has one comment, edited six times — the `ai-review` gate's
  sticky-comment pattern, reused rather than reinvented.

- **What the comment contains:** an HTML table, one row per changed screenshot,
  three `<img width="260">` cells (expected · actual · diff) pointing at
  `raw.githubusercontent.com`; the differing-pixel count, recomputed from the
  two PNGs by `scripts/visual-diff.mjs` at the config's own `threshold: 0` so it
  is the number Playwright compared on rather than a second opinion; the
  `/approve-visuals` instruction and who may run it; and a link to the full
  **Playwright HTML report** artifact, whose own viewer offers the side-by-side
  and slider modes for a serious look. That report needs the visual config to
  emit it — `reporter` becomes `[['list'], ['html', { open: 'never' }]]` — and
  it is uploaded beside `visual-diff` as today.

The inline gallery is the *first* look, deliberately: it must be enough to answer
"is this the change I made" without leaving the PR. The artifact is the second
look, for the cases where it is not.

**Update (2026-08-01): the deliberate change was the invisible one.** A pull
request that re-renders the baselines and commits them — the normal way to ship
a UI change here, and the end state of every `/approve-visuals` — makes the
comparison green *by construction*: no mismatch, no artifact, nothing in the
table above. GitHub then collapses the committed PNG diff in **Files changed**,
so precisely where before/after matters most, it is one click away at best and
unseen at worst. The gallery therefore gained a second section, in the same
upserted comment:

- **"Deliberate baseline changes in this PR"** — one row per changed baseline,
  up to 40 rows, `Before (base)` and `After (head)` images side by side. A new
  baseline shows *new surface* in the Before cell, a deleted one *baseline
  removed* in the After cell, and a rename reads its Before from the previous
  path. Past the cap, the comment adds a one-line note naming how many further
  changes are not shown and pointing at the Files tab instead.
- **The pair is built from commits, not from a diff.** The job checks out the
  trusted base and has no head tree, so the changed files come from the
  pull-request files API and each side is a `raw.githubusercontent.com` URL
  pinned to `base.sha` or `head.sha` — both in the event payload, both
  immutable, so the caching problem the run-ID path solves does not arise here.
  This repository is public, so those URLs need no token. This section is
  built by the same `visual-report` job described above, so it already holds
  `contents: write` + `pull-requests: write` — consuming the head SHA here is
  still safe under those scopes because the job's checkout stays pinned to the
  trusted base commit and the head SHA reaches it only as a URL component,
  never as a ref: no PR-authored code executes in this job regardless of which
  scopes it holds.
- **The file names are pull-request-authored input**, so only paths under
  `demo/visual/__screenshots__/`, in `[A-Za-z0-9._-]` segments, ending in
  `.png`, and carrying no `..` segment become a URL. The head SHA enters the job
  as a URL component and never as a checkout ref — the structural probe pins
  that distinction.
- **The mismatch table keeps its own heading** ("Pixel mismatches against the
  committed baselines"), so a reader is never left guessing which of the two
  situations a row describes. A run with neither still posts nothing new.

### 2. Approval closes the loop IN GIT

**A maintainer comments `/approve-visuals`.** A new workflow, `approve-visuals.yml`,
listens on `issue_comment` and, when it accepts the comment, dispatches the
existing `visual-baselines` workflow with `update: true` against the pull
request's branch. That run re-renders the baselines on the linux runner, re-runs
the suite as a comparison against what it just wrote (the ADR-0008 gate that
stops a partial baseline set from escaping), and — this is the new part —
**commits the PNGs onto the PR branch** instead of only uploading them as an
artifact.

`visual-baselines` therefore gains one input, `commit` (default `false`): with
`update: true, commit: true` the gated run pushes
`demo/visual/__screenshots__/**` to the ref it was dispatched on. The artifact
upload stays exactly as it is — it is the fork path (§3) and the manual path.

**The exact author rule** is evaluated in the read-only `guard` job's `if:`
before any step runs. The guard then trims the body and requires exact equality
with `/approve-visuals`; only that result can create the write-capable job:

```yaml
on:
  issue_comment:
    types: [created]

permissions:
  contents: read

jobs:
  guard:
    if: >-
      github.repository == 'chomamateusz/agentproofarch'
      && github.event.issue.pull_request != null
      && startsWith(github.event.comment.body, '/approve-visuals')
      && (
        github.event.comment.author_association == 'OWNER'
        || contains(fromJSON(vars.VISUAL_APPROVERS || '[]'),
                    github.event.comment.user.login)
      )
```

The `approve-visuals` job needs `actions: write` to dispatch the baseline
workflow, `contents: read` to resolve the pull request, and
`pull-requests: write` to comment and react. It is not created unless the
trimmed body equals the command.

Read as prose, so there is no ambiguity about who may re-baseline:

1. **`author_association == 'OWNER'`** — GitHub computes this field itself, per
   comment, from the commenter's relationship to the repository; it is part of
   the webhook payload, not something the commenter can write. On a
   user-owned repository exactly one account is `OWNER`.
2. **or a login present in the repository variable `VISUAL_APPROVERS`** — a
   plain (non-secret) JSON array of logins, empty by default, editable only by
   someone with repository admin. Empty default means: today the rule is
   owner-only, and widening it is a visible, auditable settings change.
3. **`COLLABORATOR`, `MEMBER` and `CONTRIBUTOR` are deliberately not accepted.**
   Write access on this repository is held by the machine account
   `chomamateusz-agent`, and an agent that wants a re-baseline **dispatches
   `visual-baselines` itself** — it has `gh` access and does not need to talk to
   itself through a pull-request comment. Accepting `COLLABORATOR` would buy
   nothing and would make every future collaborator a baseline approver by
   default.
4. **`types: [created]` only.** An `edited` comment is never a trigger: a comment
   can be edited by someone other than its author (a maintainer can edit
   anyone's), and the payload's `comment.user` is still the original author. The
   one form of "approval by editing" is therefore not reachable.
5. **A comment that fails the rule produces no run and no reply.** The silence is
   deliberate: replying would let any stranger make the bot post on demand. The
   gallery comment states who may approve, so the information is available before
   anyone types the command.

**The comment is data, never code.** The body is read from the webhook context
by `actions/github-script` and compared after `trim()`; it is never interpolated
into a `run:` block, and the pull-request number comes from
`github.event.issue.number`, not from the text. This closes the standard Actions
script-injection seam by construction rather than by escaping.

**After the commit, GitHub's native PNG diff is the final review artifact.** The
new baselines are a normal commit on the PR branch, so the Files tab renders each
changed screenshot with 2-up, swipe and onion-skin. That view — not the
`/approve-visuals` comment — is the decision of record: the command asks for a
re-render at the branch tip, and whether the result is right is judged from the
committed diff, in the same PR, by the same reviewers who judge the code.

### 3. The security walk (TIMELINE-TRACE)

The doctrine (`architecture.md` §Security) is that a security claim counts only
when the *actual* event order has been walked. Here it is, hostile intent
assumed.

**Scenario A — a stranger tries to make CI commit for them.**

1. `attacker` (no access) opens a pull request from a fork, or finds an existing PR.
2. `attacker` comments `/approve-visuals`.
3. GitHub emits `issue_comment.created`. The payload's `author_association` is
   computed by GitHub as `NONE` / `CONTRIBUTOR` — the attacker cannot set it.
4. The `if:` is evaluated **against `approve-visuals.yml` as it exists on the
   default branch**. `issue_comment` is a repository-level event: GitHub always
   runs the default-branch version of the workflow file, never the version on
   the PR's head. So the rule the attacker is trying to pass is a rule the
   attacker cannot have edited — a pull request that rewrites
   `approve-visuals.yml` changes nothing until it is merged to `main`, and `main`
   is behind the `main-gates` ruleset (PR required, empty bypass, five required
   checks).
5. The condition is false. **No job is created.** No token is minted, no step
   runs, nothing is commented. The attacker has spent a comment.

**Scenario B — the owner approves on a same-repo PR (the happy path, walked for
its privileges).**

1. Owner comments `/approve-visuals` on PR #N, whose head branch lives in this
   repository.
2. `approve-visuals.yml` (default-branch version) matches. The read-only guard
   accepts the exact trimmed command; the following job holds `actions: write`
   + `contents: read` + `pull-requests: write` so it can dispatch, resolve the
   PR, post confirmation, and react to the command.
3. The job resolves the PR through the API and **refuses when
   `head.repo.full_name != github.repository`** (§fork story below). It records
   the head SHA it saw and names it in the confirmation comment.
4. It dispatches `visual-baselines` (`update: true`, `commit: true`) on the head
   branch. That run holds `contents: write`, and it is the one job in this design
   where PR-authored code (the demo app, its build, its Playwright specs)
   executes alongside a write token.
5. **Why that is acceptable, stated exactly.** The ref must be a branch *in this
   repository*, so whoever authored it already has Write — the dispatch confers
   no privilege the branch author lacked, and today's manual `visual-baselines`
   dispatch already runs the same code with the same identity, minus the write
   scope. The delta is bounded by the wall that actually protects releases:
   `main` and `production` are governed by rulesets with **empty bypass lists**,
   so a `contents: write` token cannot land a commit on either — it can push to
   unprotected branches, exactly like the account that pushed the branch. The
   job requests no other scope, needs no repository secret at all, and never sees
   one.
6. The run re-renders, re-compares (a failed comparison stops the commit — the
   ADR-0008 mechanism, now gating a push instead of an upload), and pushes the
   PNGs to the head branch as `github-actions[bot]`.
7. The PR shows a baseline commit. The image diff is reviewed. If it is wrong,
   it is reverted like any other commit — the approval is not a state in someone
   else's database, it is a commit in this one.

**Scenario C — a race the walk exposes.** Between step 1 and step 6 the branch
can move. The dispatch is by branch name, so the re-render is always of the
*current* tip, which is the only correct baseline — but it may not be what the
maintainer looked at. This is not patched with a lock; it is why decision 2 puts
the review at the committed diff rather than at the command, and why the
confirmation comment names the head SHA that was dispatched.

**Update (2026-07-28):** this race is closed as of
[PR #96](https://github.com/chomamateusz/agentproofarch/pull/96), which also
retires residual (a) below. `approve-visuals` now passes the head SHA it
recorded as a `sha` input; `visual-baselines` checks out that exact commit
instead of the dispatched branch tip, and the run still pushes to the branch —
so a tip that moved in between makes the push fail non-fast-forward rather than
land baselines for code no maintainer looked at.

**The fork limitation, stated honestly rather than discovered later.** For a pull
request from a fork:

- The `GITHUB_TOKEN` is **read-only regardless of the `permissions:` block**, and
  it has no access to the fork's repository at all. Therefore **neither half of
  this loop works on fork PRs**: `visual-report` cannot push the gallery branch
  or post the comment (it is guarded on
  `head.repo.full_name == github.repository` and skips rather than fails red),
  and `visual-baselines` cannot commit baselines onto a branch that does not
  exist in this repository.
- `pull_request_target` would hand a write token to a workflow checking out
  untrusted code. It is rejected outright; it is the exact exposure this design
  spent a separate job to avoid.
- **The documented manual path for a fork PR:** the `visual` job still runs and
  still uploads `visual-diff` and the HTML report, so the evidence exists. A
  maintainer reviews the artifact, then either (a) with *Allow edits from
  maintainers* enabled on the PR, checks the branch out locally
  (`gh pr checkout <n>`), takes the PNGs from a `visual-baselines` artifact
  (dispatched on `main` or on a mirror branch) and commits them onto the fork
  branch by hand, or (b) pushes the fork head to a branch in this repository
  (`git push origin HEAD:pr-<n>-visuals`), runs the loop there, and asks the
  contributor to cherry-pick the baseline commit. Neither is automated, and
  neither pretends to be.

### 4. Rejected alternatives

| Rejected | Why (one line) |
|---|---|
| **Argos** | Kept as an **optional comfort add-on**, not the loop: it takes our exact PNGs and needs **zero secrets** (GitHub OIDC since 2026-05-11, tokenless fallback for public repos and fork PRs), but its Approve writes to Argos's baseline store, so it cannot close a loop that ends in git. **Named trigger:** two occasions in one calendar month where the inline gallery is insufficient to decide and a maintainer downloads the report anyway — then Argos is added as an advisory commit status, never as a gate. |
| **Visual Regression Tracker (self-hosted)** | Best OSS review UI in the evaluation and a genuinely live server, but baselines move out of git into its Postgres and file store — a second source of truth — and its Playwright agent has not been pushed since 2024-08. |
| **Chromatic** | Uploads DOM archives and renders them in its own cloud: the second render farm the hard constraint forbids, before the price of UI Review even matters. |
| **Lost Pixel** | Sunset — repository archived 2026-04-22, team at Figma, no shutdown date published; a live pricing page is not evidence of a live product. |
| **Percy** | `percy upload` can take our static PNGs, but the price is a long-lived `PERCY_TOKEN` in CI, which CHEAP SECRETS treats as a cost, and the upload path is a second-class citizen in that product. |
| **Vizzly** | The closest "almost" (bring-your-own-screenshots, MIT CLI, free OSS plan), rejected on a closed backend from a one-year-old vendor plus a CI token; revisit if this loop proves painful. |
| **reg-suit / reg-cli as the gallery generator** | Rejected as an unnecessary fourth image pipeline: Playwright already writes expected/actual/diff and ships an HTML report with the same viewer modes, and reg-suit's own model puts baselines in S3. |
| **GitHub Pages for the gallery** | The site is published from `website/` by `docs-deploy.yml`; interleaving per-PR image directories into it couples the docs deployment to test output for a link that a raw URL already provides. |
| **`pull_request_target` for fork support** | A write token on a workflow that checks out untrusted code, to serve the one case this design deliberately leaves manual. |
| **A GitHub App or PAT so the baseline commit re-triggers CI** | Solves a real annoyance (below) by introducing exactly the long-lived credential CHEAP SECRETS exists to avoid. |

## Consequences

- **The nine manual steps become: read the comment, type `/approve-visuals`,
  review the committed image diff.** Nothing is downloaded, nothing is copied
  into a working tree, and the artifact remains available for the cases where the
  inline gallery is not enough.
- **A commit pushed with `GITHUB_TOKEN` does not trigger workflows** (GitHub's
  recursion guard). So after the baselines land, the PR's `visual` status still
  shows the pre-approval run until the next push to the branch or a manual
  re-run of the job. Today that is cosmetic — `visual` blocks nothing. **It stops
  being cosmetic on the day the owner arms `visual` as a required check**, and
  the arming decision (ADR-0008 §4) must account for it: the honest options are a
  re-run by hand, an empty commit, or the App/PAT this ADR rejects.
- **`ci.yml` grows one job, `visual-baselines` one input, and the visual config
  one reporter.** No new
  service, no new account, no new secret: the whole loop runs on the ephemeral
  `GITHUB_TOKEN`, which is why it costs nothing under CHEAP SECRETS.
- **The repository grows a `visual-reports` branch** whose content is machine
  written, whose history is one commit, and whose size is bounded by the open
  pull requests with visual differences. It is unprotected on purpose — protecting
  it would block the force-push that keeps it bounded — and it holds nothing whose
  loss matters.
- **Fork contributors get a strictly worse experience, on record.** They see a red
  non-required job and an artifact; the gallery and the one-command re-baseline
  are maintainer-branch features. This is a consequence of the fork token model,
  not a decision to under-serve them, and the manual path is documented above
  rather than discovered by the first external contributor.
- **Enforcement, honestly tiered.**

  | Rule | TYPE | LINT | TEST | REVIEW+AI |
  |---|---|---|---|---|
  | Only OWNER (or `VISUAL_APPROVERS`) can trigger a re-baseline | n/a | n/a | the `if:` expression **is** the mechanism (GitHub evaluates it server-side, from payload fields the commenter cannot set, before a job exists); `config-regression/visual-approval.test.ts` cannot execute it, so it fails the build when an edit widens the accepted set instead | that no future edit widens it to `COLLABORATOR` |
  | The publisher never executes PR code | n/a | n/a | the same probe asserts the `visual-report` checkout is `pull_request.base.sha` and no head ref | the job boundary itself |
  | The comment body never reaches a shell | n/a | n/a | the probe fails on any `${{ … github.event.comment.body … }}` interpolation | review-tier for the subtler variants — a `run:` step reading `github.event.comment.*` is a blocking finding |
  | Baselines only ever change through a gated CI run | n/a | `ignoreSnapshots` (ADR-0008) keeps a mac from authoring | the second comparison run gates the commit exactly as it gates today's artifact | — |

- **Two residuals stay open and named.** (a) The approval races a push to the
  branch (Scenario C) — mitigated by reviewing the committed diff, not the
  command. (b) `raw.githubusercontent.com` serves the gallery images from a
  public repository, so a screenshot published for review is publicly readable;
  that is already true of every committed baseline in this repo, and it would
  need revisiting the moment a screenshot could contain non-demo data.
