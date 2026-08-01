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
Each spec states its purpose, reference standard, method (what to grep, run,
or compare), what counts as a finding, and known blind spots.

| Spec | Answers |
|---|---|
| [`docs-truth`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/docs-truth.md) | Do the docs describe what the code actually does? |
| [`ci-security`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/ci-security.md) | Are the CI/CD pipeline and its secrets handled safely? |
| [`dependencies`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/dependencies.md) | Are third-party packages current, licensed, and free of known vulnerabilities? |
| [`dead-code-and-test-gaps`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/dead-code-and-test-gaps.md) | Is there code nobody calls, or behaviour nobody tests? |
| [`consistency`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/consistency.md) | Do parallel surfaces (contract/CLI/UI/docs) agree with each other? |
| [`external-links`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/external-links.md) | Do links out of the repo still resolve to what they claim? |
| [`completeness`](https://github.com/chomamateusz/agentproofarch/blob/main/docs/audits/completeness.md) | What does this product need that isn't in here at all — checked against the PRD and a living table-stakes checklist? |

`completeness` is the newest entry, added after the 2026-08-01 audit found
the account-management gap described above; it embeds the table-stakes
checklist as a living list, re-verified on every run rather than treated as a
fixed rubric.

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
under `docs/audits/`, add the row above and to the in-repo index.
