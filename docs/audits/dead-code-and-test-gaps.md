# dead-code-and-test-gaps audit

## Purpose

Find code nobody calls and behaviour nobody tests — the two are grouped
because both are found by the same method (walk the call/coverage graph
looking for a dead end) and both erode the same guarantee: that what's in the
repo is either exercised or explicitly declared inert.

## Reference standard

The dependency graph the codebase itself defines (imports, exports, route
registrations) and the coverage ratchet already enforced by `pnpm run check`
(demo/CLAUDE.md: "coverage thresholds are a ratchet floor... enforced here, so
a coverage regression fails `pnpm run check`"). This audit goes beyond the
ratchet floor, which only stops regression — it doesn't find code that was
*always* under-tested.

## Method

- Run knip (already part of `pnpm run check`) and read its full output, not
  just the pass/fail — knip fails the gate only on unused exports/types with
  no `knip.jsonc` declaration; anything already suppressed via `entry` or
  `@public` is invisible to the gate and needs manual review here: for each
  suppressed surface, confirm it genuinely has no in-repo importer *and* a
  real external consumer (a published contract, a documented public API) —
  a stale `@public` tag hiding truly dead code is exactly what this audit
  catches and the gate cannot.
- Grep for exported functions/types/routes with zero in-repo call sites
  outside their own test file, cross-checked against knip's report (knip can
  miss dynamic imports and string-built route paths).
- Read the coverage report (`pnpm run check` with `--coverage`) file-by-file
  for files sitting well above the aggregate ratchet floor on lines but with
  branch coverage near zero — a common way error paths hide from the ratchet
  (statement coverage counts a branch as covered if any arm runs once).
- For every mounted route (grep the router registration, e.g. `app.on`/
  `app.get`/`app.post` calls in `apps/server/src/app.ts` and any Hono
  sub-routers), confirm at least one integration or contract test exercises
  it. Cross-reference against the cross-cutting finding pattern from the
  2026-08-01 completeness audit: `app.ts` mounts the entire better-auth
  router as a block (`BETTER_AUTH_API_PATH_PATTERN`), so individual
  sub-paths under that pattern (`change-password`, `list-sessions`,
  `two-factor/*`, ...) can be publicly reachable and completely untested
  without any single route registration line naming them — this audit must
  enumerate better-auth's own route table (its plugin config), not just grep
  this repo's router code, to find those.
- For domain/core logic (`core/`), confirm every exported use-case has at
  least one unit test file; a use-case with only integration coverage is not
  a finding by itself, but a use-case with *no* test file anywhere is.

## What counts as a finding

- An exported symbol with no in-repo importer and no `knip.jsonc`
  declaration explaining the external consumer (this should already be
  impossible if `check` is green — a finding here means the declaration
  itself is stale or unjustified).
- A mounted route (including sub-paths of a blanket-mounted router) with no
  test at any level (unit, integration, contract, e2e).
- A branch (error path, guard clause, feature flag off-path) with zero
  coverage despite the containing file being above the aggregate threshold.
- A `TODO`/`FIXME` marking code as temporary or a stub that has existed
  across more than one release without a backlog entry.

## Known blind spots

- Cannot detect *missing* code (a use-case that should exist but was never
  written) — that's [`completeness.md`](completeness.md) territory, not this
  one.
- Coverage percentage is a proxy for "exercised," not "correct" — a covered
  branch can still assert nothing meaningful; this audit flags absence of
  coverage, not weakness of assertions (that's closer to a code-review
  concern than an audit one).
- Dynamic dispatch (plugin registries, better-auth's own internal routing)
  can hide real call sites from static grep; cross-referencing the
  library's own route table (as the method section requires for
  better-auth) is the mitigation, but a similarly-shaped blanket mount from
  a *different* third-party library could still be missed if this spec
  isn't updated to name it.
