# Audit specifications — index and doctrine

An audit without a spec answers only the questions it happened to be asked.
Every recurring audit run against this repository has a spec here: **purpose,
reference standard, method, what counts as a finding, known blind spots.**
Writing the spec down first is what turns "we looked at it" into "here is
exactly what we checked, and here is exactly what we didn't."

## Why completeness audits exist

The founding example is the 2026-08-01 password-change miss. Password
change/reset, email verification, email change, account deletion, session
revoke, profile edit, tenant rename/delete and the legal surfaces (terms,
privacy, consent) appeared in **none** of the PRD, the architecture's
OUT-OF-SCOPE blocks, or [`docs/backlog.md`](../backlog.md) — not deferred with
a named trigger the way the register requires, just absent. A
[docs-truth audit](docs-truth.md) checking "does the code match what the docs
claim" would have passed clean, because the docs never claimed account
management existed. Only a check that started from an external reference —
"what does every SaaS product need regardless of what this repo's docs say" —
could surface a hole shaped like an entire capability area.

That is the reason [`completeness.md`](completeness.md) is its own spec
instead of a section bolted onto `docs-truth.md`: truth audits are bounded by
the artifact under test (compare docs to code, code to code); completeness
audits are bounded by an external reference (a PRD, a checklist, a standard)
and specifically hunt for **absences** — capabilities nobody wrote down as
missing because nobody thought to ask.

## The roster

| Spec | Answers |
|---|---|
| [`docs-truth.md`](docs-truth.md) | Do the docs describe what the code actually does? |
| [`ci-security.md`](ci-security.md) | Are the CI/CD pipeline and its secrets handled safely? |
| [`dependencies.md`](dependencies.md) | Are third-party packages current, licensed, and free of known vulnerabilities? |
| [`dead-code-and-test-gaps.md`](dead-code-and-test-gaps.md) | Is there code nobody calls, or behaviour nobody tests? |
| [`consistency.md`](consistency.md) | Do parallel surfaces (contract/CLI/UI/docs) agree with each other? |
| [`external-links.md`](external-links.md) | Do links out of the repo still resolve to what they claim? |
| [`completeness.md`](completeness.md) | What does this product need that isn't in here at all — checked against the PRD and a table-stakes SaaS checklist? |

## Running an audit

Each spec's **method** section is written to be mechanical enough to hand to
an agent verbatim: what to grep, what to run, what to diff. A finding is only
a finding if it matches that spec's "what counts as a finding" section — this
keeps audit reports comparable across runs and prevents scope creep into
"things I noticed" that no reference standard actually calls out. A spec's
"known blind spots" section is not optional decoration: it is the list of
questions *that* audit cannot answer, which is exactly why the roster has more
than one entry.

New audit types get added here the same way `completeness.md` was: identify a
class of question the existing roster structurally cannot answer, write the
spec, add the row above.
