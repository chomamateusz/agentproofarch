# docs-truth audit

## Purpose

Catch documentation that describes behaviour the code no longer has, or never
had. This is the audit for drift, not for absence — see
[`completeness.md`](completeness.md) for the complementary "what's missing
entirely" question this one cannot answer.

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
