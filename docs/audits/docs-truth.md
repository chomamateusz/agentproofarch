# docs-truth audit

## Purpose

Catch documentation that describes behaviour the code no longer has, or never
had. This is the audit for drift, not for absence — see
[`completeness.md`](completeness.md) for the complementary "what's missing
entirely" question this one cannot answer.

## Standard reference

**ISO/IEC/IEEE 26514:2022** (design and maintenance of software user
information) as the named standard for documentation quality, and
**[Diátaxis](https://diataxis.fr/)** as the free structural rubric (tutorial /
how-to / reference / explanation) for judging whether a claim sits where a
reader will find it.

**What is not claimed — and this matters more here than in any other spec:**
both are frameworks, not conformance tests. 26514 prescribes process and is
paywalled; it is named, not read, and this repo does not cite clauses it has
not opened. Diátaxis shape mismatches are *style* notes in this spec's
vocabulary, never findings. No report may state or imply 26514 conformance,
and the tooling proxies below demonstrate nothing about it either.

## Reference standard

The code itself. `docs/architecture.md` and `docs/prd-agentproofarch-foundation.md`
are normative for design intent, but for docs-truth purposes the running
implementation is the ground truth being checked against — a doc is wrong if
it disagrees with what `demo/` actually does, regardless of which one is
"supposed" to be right.

## Method

- For every concrete, checkable claim in `docs/`, `website/docs/`, `README.md`
  and `CLAUDE.md`/`AGENTS.md` files (a command, a flag, a route, an env var, a
  file path, a port name, a gate name, a number), grep the codebase for the
  thing being claimed and confirm it still exists with the stated shape.
  - Commands: run them (`pnpm run <script>` names must exist in
    `demo/package.json`/`website/package.json`).
  - File/module paths: `find`/`ls` them.
  - Env vars: cross-check against `.env.example` and the schema that reads it
    (this overlaps with, but does not replace, the env-schema check already
    built into `pnpm run check`'s doc-lint step).
  - Route/API paths: grep the router registration.
  - Numbers (thresholds, counts, versions): grep the config or constant that
    should match.
- Check the errata pattern used in `docs/prd-agentproofarch-foundation.md` §0:
  when a normative doc has a live errata block correcting the body, confirm
  every drift the errata claims to fix is *actually* fixed in the errata, not
  just flagged — errata entries can themselves go stale.
- Check `docs/backlog.md` entries marked `BUILT` against the code path they
  cite; a register entry can flip to built without the citation being updated.
- Sample commit-linked claims (PR numbers, ADR numbers referenced from prose)
  and confirm the referenced artifact says what the citing text claims it
  says.

## Automatable checks

`doc-lint` inside `pnpm run check` (docs ↔ enforcer config in both directions,
env-var schema, migration-sequence lint) and the Docusaurus build itself,
which throws on broken links, anchors and markdown links. Both are already
green on every merged commit, so neither finds anything this audit is for: a
sentence can be perfectly linted and still describe behaviour the code lost
two releases ago. Every claim-level check in the method above is a manual
grep. A prose linter (Vale) would add style enforcement, not truth
enforcement, and is not proposed.

## What counts as a finding

- A doc states a capability, flag, path, command or number that does not
  match the code as of the commit under audit.
- A doc claims something is out of scope / not built, and the code
  demonstrably does it (or vice versa).
- An errata or backlog entry that no longer matches the thing it corrects.
- A cross-reference (doc-to-doc, doc-to-ADR, doc-to-PR) that points at content
  contradicting the citing claim.

Not a finding: a doc describing intended future behaviour that is clearly
labelled as such (roadmap, backlog, ADR "considered options" sections).

## Known blind spots

- Cannot detect an entire capability area that no doc ever mentions — there is
  nothing to check truth against. That is exactly what
  [`completeness.md`](completeness.md) is for.
- Cannot detect docs that are technically true but misleading by omission
  (e.g. "password reset is provider-ready" without saying no UI/CLI/tests
  exist) — that nuance needs a human or a completeness-style check for the
  missing surfaces.
- Prose-level claims about *why* a decision was made are not independently
  checkable against code; only the *what* is.
