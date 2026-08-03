# dependencies audit

## Purpose

Confirm the dependency tree is current, correctly locked, appropriately
licensed, and free of known-vulnerable versions — beyond what the
non-blocking advisory step in `pnpm run check`/CI already flags.

## Standard reference

**OSV / the GitHub Advisory Database** for known vulnerabilities (already the
spec's reference below — the anchor only names it explicitly), **OpenSSF
Scorecard 5.5.0** for the four checks that overlap this audit
(`Vulnerabilities`, `Dependency-Update-Tool`, `License`,
`Pinned-Dependencies`), and **SLSA v1.2 Build L1** as the vocabulary for
"where did this artifact come from" — L1 means provenance exists, which this
repo's own artifacts do not have (the position is stated in
[`ci-security.md`](ci-security.md)).

**What is not claimed:** an OSV-clean tree is not a safe tree, and Scorecard's
`Dependency-Update-Tool` score is not automatically a security verdict. Weigh
the check against the doctrine and record the reasoning — do not change update
policy merely to move a number.

`renovate.json` configures one weekly pull request grouping every non-major
update, majors kept out of that group so a breaking bump is reviewed on its own,
and weekly lockfile maintenance; both the `demo/` and `website/` pnpm roots are
picked up by autodiscovery rather than named in the config. Its
`minimumReleaseAge` of three days is the same window as the `4320` minutes both
roots' `pnpm-workspace.yaml` already enforces, so automation cannot select a
release before the package manager would admit it. The configuration does not
activate Renovate by itself: the repository owner must install the Renovate
GitHub App on the repository first, which is a click no agent can make.

## Reference standard

`pnpm-lock.yaml` as the ground truth for resolved versions; each package's
declared `engines`/peer ranges; OSV/GitHub Advisory Database for known CVEs;
each dependency's declared license against this repo's license posture
(`LICENSE` at the root — confirm no dependency's license is incompatible with
distributing this codebase).

## Method

- Run `pnpm audit --prod` (no `--audit-level` filter, unlike the CI advisory
  step) across both `demo/` and `website/` workspaces; separately note
  prod-only vs dev-only findings — dev-only vulnerabilities matter less but
  are not zero-risk (build-time supply-chain compromise).
- Run `pnpm outdated` in both workspaces; bucket results into patch/minor
  (low friction) vs major (breaking-change risk, needs a migration plan) —
  a finding is a package more than one major version behind **and** either
  actively maintained upstream (a live newer release exists) or explicitly
  EOL.
- Cross-check `pnpm-workspace.yaml`'s `onlyBuiltDependencies` allowlist
  (demo/CLAUDE.md: "keep that allowlist minimal, add an entry only when a
  gate demonstrably fails without it") — for each entry, confirm a comment or
  commit trail explains why it was needed; an undocumented entry is a
  finding.
- Confirm `minimumReleaseAge: 4320` (three-day cooldown) is actually
  configured where the docs claim, and that the CI runner's lockfile
  resolution respects it (no `--no-minimum-release-age` escape hatch left
  enabled anywhere).
- Spot-check license metadata (`pnpm licenses list` or equivalent) for any
  copyleft (GPL/AGPL) dependency reaching the production bundle; a
  server/browser bundle pulling in AGPL code is a finding regardless of
  vulnerability status.
- Confirm `pnpm-lock.yaml` is not stale against `package.json` — this
  duplicates part of what doc-lint's lock-lint already does in `pnpm run
  check`, but this audit additionally checks that the lockfile's *resolved*
  versions (not just presence) match what `pnpm install --frozen-lockfile`
  would produce fresh, catching drift the structural lock-lint check doesn't
  reach.

## Automatable checks

| Check | Tool | Wired today |
|---|---|---|
| Known vulnerabilities, production tree | `pnpm audit --prod` | Yes — advisory step inside the `check` job |
| Known vulnerabilities, full tree + OSV directly | `pnpm audit`, Scorecard `Vulnerabilities` | `pnpm audit` by hand; Scorecard via `scorecard.yml` |
| Version drift | `pnpm outdated` | No — run it during the audit |
| Licenses | `pnpm licenses list`, Scorecard `License` | No — run it during the audit |
| Lockfile freshness | `lock-lint` in `pnpm run check` | Yes, structurally; resolved-version drift still needs the manual step above |
| Update-bot configuration | Renovate, Scorecard `Dependency-Update-Tool` | `renovate.json` is wired; the owner-installed GitHub App is still required to activate it |

Everything the tools do not decide: whether an advisory is reachable in this
codebase's usage, whether an `onlyBuiltDependencies` entry is justified,
whether a major-version gap is worth the migration, and whether a copyleft
license actually reaches the distributed bundle.

## What counts as a finding

- A `high`/`critical` advisory on a production dependency with no
  documented mitigation or upgrade plan.
- A dependency more than one major version behind with no tracking entry
  (issue, backlog line, or `TODO` with rationale).
- An `onlyBuiltDependencies` entry with no documented justification.
- A copyleft license reaching the production bundle.
- A lockfile/`package.json` mismatch that `pnpm install --frozen-lockfile`
  would reject.

## Known blind spots

- Cannot assess whether an outdated-but-unpatched dependency is actually
  exploitable in this codebase's usage pattern — severity triage still needs
  a human read of the advisory against how the package is actually called.
- Transitive Action dependencies in CI workflows are covered by
  [`ci-security.md`](ci-security.md), not here.
- Does not run a full SBOM generation (`docs/backlog.md`'s Security &
  compliance section names SBOM as a deferred, triggered capability); this
  audit is a point-in-time check, not a continuous inventory.
