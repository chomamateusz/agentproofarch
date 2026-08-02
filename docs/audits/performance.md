# performance audit

## Purpose

Answer whether the surfaces this repo publishes are fast enough to use, and —
more importantly for a repo with no performance history — establish what is
actually being measured, so a number in a report can never be mistaken for a
number about the product. Nothing else in the roster looks at latency:
[`dead-code-and-test-gaps.md`](dead-code-and-test-gaps.md) asks whether code is
exercised, never how long it takes.

## Standard reference

**Core Web Vitals** thresholds as the acceptance targets — LCP ≤ 2.5 s,
INP ≤ 200 ms, CLS ≤ 0.1, each at the 75th percentile of page loads — and
**Lighthouse CI** (`@lhci/cli` 0.15.x) as the lab instrument, with budget and
category assertions declared in `website/lighthouserc.json`.

**What is not claimed.**

- **Lab is not field.** Core Web Vitals are defined on real user traffic at
  p75. Lighthouse runs one synthetic load on a shared CI runner. The
  thresholds above are the target this audit aims at; the numbers it produces
  are lab approximations of them, and this repo collects no field data at all.
- **INP is not measured, at all.** Lighthouse cannot produce INP
  synthetically — there is no user to interact. Total Blocking Time is the lab
  proxy, and a proxy is what it stays. Any INP claim in a report is fabricated.
- **The tooling is pre-1.0 and behind.** LHCI 0.15.1 (June 2025) is the current
  release and bundles Lighthouse 12.6.1, while standalone Lighthouse is at
  13.4.1 (July 2026) — scores from the CI job and scores from a local
  standalone run are not comparable, and neither is a fixed scale over time.
  There is no official LHCI GitHub Action; the wired job installs the CLI and
  runs `lhci autorun`, which is the documented recipe.
- **Only the documentation site is covered.** See *Automatable checks*.

## Reference standard

The built artifacts as they are actually served: the Docusaurus site from
`website/build` behind `docusaurus serve` (which honours the
`/agentproofarch/` base URL — serving the directory at the server root instead
makes every asset 404 and produces a meaningless score), and, when the
application half is ever measured, the app as an authenticated user reaches it.

## Method

- Read the most recent `lhci` run before starting: the assertion results and
  the median-run report for each audited URL. It is advisory and warn-only, so
  a green job means "no assertion crossed", not "nobody regressed".
- Compare against the previous audit's numbers rather than against the
  thresholds alone. A site that moved from 0.98 to 0.91 while staying above a
  0.9 warn line has regressed; the assertion did not fire and the audit is the
  only thing that will notice.
- For each URL below the target, read *why* from the report — render-blocking
  resources, unused JavaScript, image weight, layout shift source — and name
  the specific artifact. "Performance score 0.84" is not a finding; "the search
  index adds N KB of blocking JavaScript to every page" is.
- State the coverage explicitly in every report: which URLs ran, which surfaces
  were not measured (today: the entire application), and that no field data
  exists. A performance report that does not say what it did not measure is
  the exact failure mode this spec was written to prevent.
- Backend latency: there is **no** stated latency SLO anywhere in this repo's
  docs, and therefore nothing to audit against. Record that as the standing
  position. `post-deploy-smoke` proves a deployment answers; `dr-acceptance`
  proves a backup restores; neither is a latency measurement, and CI runners
  are too variable to be authoritative about capacity even if a load tool were
  wired. The trigger for changing this is a written SLO, not a tool.

## Automatable checks

| Surface | Tool | Wired today |
|---|---|---|
| Documentation site (three representative URLs, desktop preset, 3 runs, median-run aggregation) | `lhci.yml` → `@lhci/cli` 0.15.x, assertions in `website/lighthouserc.json` | **Yes** — advisory, path-filtered, every assertion at `warn` |
| Web application shell (`/`, `/login`) as a static build | LHCI `staticDistDir` + `isSinglePageApplication` | **No** — deliberately not wired; see below |
| Authenticated application routes | LHCI `puppeteerScript` against the real stack | **No** — backlogged |
| Backend latency under load | none | **No** — no SLO exists to test against |

**First numbers, so the next run has something to compare against.** A local
run (LHCI 0.15.1, Lighthouse 12.6.1, desktop preset, 2026-08-01, one macOS
machine — not a CI runner) scored the two doc pages 0.98–0.99 on performance
and the landing page **0.87 / 0.89 / 0.93 across three runs of the same
build**. That spread, on an unchanged artifact, is the run-to-run noise this
spec keeps warning about: it straddles the 0.9 assertion line, so the landing
page will sometimes warn and sometimes not without anything having changed. A
single-run delta is not a regression, and the median-run aggregation exists
precisely because of this.

Every docs-site assertion is a `warn`, and stays one. Under the flake ruling a
red gate is never rerun to green, so wiring a pre-1.0 lab tool on a shared
runner straight to `error` would manufacture exactly the failure the ruling
forbids absorbing. Promotion to `error` needs stable numbers over weeks and an
owner decision, not a good week.

**Why the application half is not wired.** A static LHCI run over
`demo/dist/web` measures the app shell and nothing else: every `/api/*` call
404s against LHCI's own server, so React renders its unauthenticated or error
state, and no authenticated route is loaded at all. The bundle-size and
resource-count budgets it produces are genuinely useful; the LCP and TBT
numbers come from a page that never fetches. Shipping that while calling it
application performance coverage is precisely the overclaim
[`docs-truth.md`](docs-truth.md) exists to catch, so it waits for a decision
that names it correctly. Measuring the real thing means booting the e2e stack
and signing in from a `puppeteerScript` — a second login implementation beside
the Playwright fixtures, and the flakiest option available.

## What counts as a finding

- A measured URL below the Core Web Vitals target for a metric the lab can
  measure (LCP, CLS), with the responsible artifact named.
- A regression against the previous audit's numbers on any measured URL, even
  where every assertion stayed green.
- A performance claim in the docs or a report that is not supported by a
  measurement this audit can reproduce — including any INP figure.
- A surface listed as covered in this spec that the wired job is not actually
  loading (assertion or URL drift between `lighthouserc.json` and this page).

Not a finding: an unmeasured surface. It is a coverage statement, and it
belongs in the report's scope section rather than its findings list.

## Known blind spots

- **The product is unmeasured.** Everything wired today measures a static
  documentation site. No page of the application, authenticated or not, has a
  performance number attached to it.
- No field data, no real-user monitoring, no p75 of anything — the thresholds
  are borrowed from a field metric and applied to lab runs of a handful of
  URLs.
- INP is unmeasurable in this setup, and TBT is only a proxy for it.
- Shared CI runners are noisy: three runs and median-run aggregation reduce the
  variance, they do not remove it. A single-run delta is not a regression.
- Server-side and database latency are entirely outside this audit until an SLO
  exists to measure against.
