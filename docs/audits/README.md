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

## Every spec names its standard

Each spec carries two fields beyond its method: a **standard reference** — the
named, versioned external anchor a finding cites, plus an explicit statement of
what is *not* claimed by adopting it — and **automatable checks** — which parts
of the method a tool performs today, and which parts a person has to.

Both fields exist to stop the same two failures. Without a named anchor, a
finding is a preference wearing a checklist's clothes; a reader cannot tell
"this violates ASVS 6.4.3" from "the auditor would have built it differently".
Without an honest automation line, a green tool run gets reported as a passing
audit — which is how a ~57%-coverage accessibility scanner becomes an
accessibility claim, and how a lab performance score becomes a statement about
real users.

Some specs anchor to nothing, and say so. [`external-links.md`](external-links.md)
has no standard because none exists for link integrity, and inventing one would
be worse than the gap. Naming an unearned standard is itself a finding class
this roster is built to catch.

## The roster

| Spec | Answers | Standard anchor |
|---|---|---|
| [`docs-truth.md`](docs-truth.md) | Do the docs describe what the code actually does? | ISO/IEC/IEEE 26514:2022 + Diátaxis — frameworks, not tests |
| [`ci-security.md`](ci-security.md) | Are the CI/CD pipeline and its secrets handled safely? | OpenSSF Scorecard 5.5.0 checks; SLSA v1.2 as a stated position |
| [`dependencies.md`](dependencies.md) | Are third-party packages current, licensed, and free of known vulnerabilities? | OSV / GitHub Advisory Database; Scorecard `Vulnerabilities`, `License`, `Dependency-Update-Tool` |
| [`dead-code-and-test-gaps.md`](dead-code-and-test-gaps.md) | Is there code nobody calls, or behaviour nobody tests? | ISO/IEC 25010:2023 Maintainability — a label, no requirement IDs |
| [`consistency.md`](consistency.md) | Do parallel surfaces (contract/CLI/UI/docs) agree with each other? | ASVS 5.0.0 V8 for authorization parity; API Top 10:2023 as risk vocabulary |
| [`external-links.md`](external-links.md) | Do links out of the repo still resolve to what they claim? | None — and that is the correct answer |
| [`completeness.md`](completeness.md) | What does this product need that isn't in here at all — checked against the PRD and a table-stakes SaaS checklist? | OWASP ASVS 5.0.0 (V6, V7) as an ASVS-derived L2 profile; NIST SP 800-63B-4 |
| [`accessibility.md`](accessibility.md) | Can someone using a keyboard or a screen reader complete the flows this product ships? | WCAG 2.2 AA (ISO/IEC 40500:2025); axe-core 4.12.x for the ~57% machine-checkable subset |
| [`performance.md`](performance.md) | Are the published surfaces fast enough — and which of them is anyone actually measuring? | Core Web Vitals thresholds; Lighthouse CI budgets as the lab instrument |

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
spec, add the row above — with its standard anchor named, or with a plain
statement that no standard covers it. `accessibility.md` and `performance.md`
joined that way: both answer questions the other seven structurally cannot,
and both carry the coverage caveat that makes their tooling honest.
