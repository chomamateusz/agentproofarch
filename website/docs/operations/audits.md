---
title: Audit specifications
sidebar_label: 🕵️ Audit specs
description: Every recurring audit has a written spec — purpose, reference standard, method, findings, blind spots — because an audit without one only answers the questions it happened to be asked.
---

# Audit specifications 🕵️ \{#audit-specifications}

*Read this before running, or asking an agent to run, one of this repository's periodic audits.*

[Audits, and writing down what was **not** built](../guides/agent-workflow.md#audits-and-writing-down-what-was-not-built)
already covers what happens to an audit's output: DEFER lists and
verification residuals land in
[`docs/backlog.md`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/backlog.md),
each with a named trigger, never built silently. This page is about what
happens *before* that — what an audit is actually checking, and why it takes
more than one kind.

## The doctrine

An audit without a spec answers only the questions it was asked. The founding
example is the 2026-08-01 password-change miss: password reset/change, email
verification, email change, account deletion, session revoke, profile edit,
tenant rename/delete and the legal surfaces (terms, privacy, consent) sat in
**none** of the PRD, the architecture's OUT-OF-SCOPE blocks, or the deferred-work
register — not deferred with a named trigger, just unnoticed. A docs-truth
audit checking "does the code match what the docs claim" would have passed
clean, because the docs never claimed those capabilities existed in the first
place. Only a check that started from an *external* reference — a table-stakes
checklist independent of this repo's own docs — could surface a hole shaped
like an entire capability area. That is why completeness audits exist as
their own spec rather than a section of docs-truth: **truth audits are bounded
by the artifact under test; completeness audits are bounded by an external
reference and specifically hunt for absences.**

## The roster

Full specs live in
[`docs/audits/`](https://github.com/chomamateusz/agentproofarch/tree/main/docs/audits)
(index:
[`docs/audits/README.md`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/README.md)).
Each spec states its purpose, its **standard reference**, method (what to
grep, run, or compare), which of those steps are **automatable checks**, what
counts as a finding, and known blind spots.

| Spec | Answers | Standard anchor |
|---|---|---|
| [`docs-truth`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/docs-truth.md) | Do the docs describe what the code actually does? | ISO/IEC/IEEE 26514:2022 + Diátaxis — frameworks, not tests |
| [`ci-security`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/ci-security.md) | Are the CI/CD pipeline and its secrets handled safely? | OpenSSF Scorecard 5.5.0 checks; SLSA v1.2 as a stated position |
| [`dependencies`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/dependencies.md) | Are third-party packages current, licensed, and free of known vulnerabilities? | OSV / GitHub Advisory Database + Scorecard's dependency checks |
| [`dead-code-and-test-gaps`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/dead-code-and-test-gaps.md) | Is there code nobody calls, or behaviour nobody tests? | ISO/IEC 25010:2023 Maintainability — a label, no requirement IDs |
| [`consistency`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/consistency.md) | Do parallel surfaces (contract/CLI/UI/docs) agree with each other? | ASVS 5.0.0 V8 for authorization parity; API Top 10:2023 as risk vocabulary |
| [`external-links`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/external-links.md) | Do links out of the repo still resolve to what they claim? | None — and that is the correct answer |
| [`completeness`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/completeness.md) | What does this product need that isn't in here at all — checked against the PRD and a living table-stakes checklist? | OWASP ASVS 5.0.0 (V6, V7) as an ASVS-derived L2 profile; NIST SP 800-63B-4 |
| [`accessibility`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/accessibility.md) | Can someone using a keyboard or a screen reader complete the flows this product ships? | WCAG 2.2 AA (ISO/IEC 40500:2025); axe-core 4.12.x for the machine-checkable subset |
| [`performance`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/performance.md) | Are the published surfaces fast enough — and which of them is anyone actually measuring? | Core Web Vitals thresholds; Lighthouse CI budgets as the lab instrument |

`completeness` was the entry that started this page, added after the
2026-08-01 audit found the account-management gap described above; it embeds
the table-stakes checklist as a living list, re-verified on every run rather
than treated as a fixed rubric. `accessibility` and `performance` joined when
the roster was anchored to standards — each answers a question the other seven
structurally cannot.

## Anchored to something, or honestly to nothing 📐 \{#anchored-to-something}

The **standard reference** field names a versioned external anchor and, just
as importantly, states what adopting it does *not* claim. `completeness`
targets an **ASVS-derived L2 profile**, never "ASVS L2 conformance": full L2
mandates multi-factor authentication, and this product ships TOTP enrolment
without a sign-in challenge, so conformance is not merely unproven — it is
known to be absent. Saying so in the spec is cheaper than letting the first
reader assume otherwise.

The **automatable checks** field is the same discipline applied to tooling. A
green scanner is not a passing audit: `accessibility` records that axe-powered
automation identified 57.38% of issues in Deque's published study of 13,000+
page states — a useful majority of *detection*, and zero conformance —
so the manual keyboard, focus and alt-text passes are mandatory rather than
optional. `performance` records that Lighthouse cannot measure INP
synthetically at all, so any INP number in a report would be fabricated.

Two advisory jobs feed those fields, both **non-required** and neither able to
become a gate as written — see
[deliberately non-required](ci-gates.md#deliberately-non-required):

- **`scorecard.yml`** runs [OpenSSF Scorecard](https://github.com/ossf/scorecard)
  weekly (plus manual dispatch) and uploads SARIF to the Security tab. Its
  checks name in a shared vocabulary what `ci-security` already greps for by
  hand — `Token-Permissions`, `Pinned-Dependencies`, `Dangerous-Workflow`,
  `Branch-Protection`. Several checks are *expected* to score badly here
  (`Dependency-Update-Tool`, `SAST`), and the spec records why each divergence
  is deliberate: an update bot has to respect the three-day
  `minimumReleaseAge` cooldown before it is an improvement, and a score is not
  a reason to change doctrine. The first run's mechanical findings were fixed
  as findings, not as score: a
  [security policy](https://github.com/chomamateusz/agentproofarch/blob/main/SECURITY.md)
  now exists, the last two workflow-level write tokens moved onto the single
  job that needs each (`visual-baselines`' baseline push and `ai-review`'s
  verdict comment), and the self-host image's base layers are pinned by digest.
  `Token-Permissions` still does not reach 10: seven jobs hold a job-scoped
  write they cannot function without, from tag creation to the SARIF upload
  this very check arrives through — which the spec enumerates rather than
  hides.
- **`lhci.yml`** runs Lighthouse CI over the built documentation site with
  every assertion at `warn`. It measures this site, not the application — the
  application's authenticated routes have no performance number attached to
  them at all, which `performance` states as its defining blind spot rather
  than hiding behind a green job.

## Using a spec

Each spec's method section is written mechanically enough to hand to an
agent verbatim. A finding only counts if it matches that spec's "what counts
as a finding" section — this keeps reports comparable run to run and stops
scope creep into "things I noticed" with no reference standard behind them.
The "known blind spots" section is not optional decoration: it is the
explicit list of questions that particular audit cannot answer, which is the
whole reason the roster has more than one entry instead of one big
everything-audit.

New audit types get added the same way `completeness` was: identify a class
of question the existing roster structurally cannot answer, write the spec
under `docs/audits/`, add the row above and to the in-repo index — naming the
standard it anchors to, or stating plainly that none exists. Claiming an
unearned standard is itself a finding class this roster is built to catch.
