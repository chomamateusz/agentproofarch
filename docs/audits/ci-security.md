# ci-security audit

## Purpose

Verify the CI/CD pipeline and its secrets cannot be abused to run arbitrary
code, exfiltrate credentials, or push unreviewed changes past the gates
described in [`website/docs/operations/ci-gates.md`](../../website/docs/operations/ci-gates.md)
and [`website/docs/operations/ai-review-gate.md`](../../website/docs/operations/ai-review-gate.md).

## Reference standard

GitHub Actions hardening practice (least-privilege `permissions:`, pinned
action refs, no secret exposure to `pull_request_target` from forks, no
`pull_request` workflows with write tokens executing untrusted checkout code)
plus this repo's own stated doctrine: the flake ruling (owner ruling
2026-07-20, DECIDE F3 — a red gate is never rerun-to-green), the required-check
set (`check`/`smoke`/`e2e`/`docker-smoke` + `ai-review` on `main-gates`), and
the agent-boundary rules in
[`website/docs/guides/agent-workflow.md`](../../website/docs/guides/agent-workflow.md)
(no platform CLI stays logged in on an agent-driven machine, no production
DB URL reachable from an agent shell).

## Method

- List every workflow in `.github/workflows/`; for each, read the trigger
  (`on:`), the `permissions:` block (repo-default if absent — flag as a
  finding, since default permissions are broader than needed), and whether it
  checks out a PR head from a fork (`pull_request` vs `pull_request_target`).
- Grep every workflow for `${{ secrets.* }}` usage; for each secret, confirm
  it is only referenced in jobs that cannot run attacker-controlled code
  (i.e. not in a step that also runs `pnpm install`/build scripts from an
  unreviewed fork branch without an approval gate).
- Confirm required-check branch protection (`main-gates`) actually lists the
  gates the docs claim (`check`, `smoke`, `e2e`, `docker-smoke`, `ai-review`)
  — via `gh api repos/:owner/:repo/rulesets` or the equivalent branch
  protection endpoint, not by re-reading the docs about it.
- Confirm the `ai-review` token is what
  `agent-workflow.md` claims: a `claude setup-token` subscription-scoped
  credential, not a PAT with repo-write or org-admin scope. Check the secret's
  last-rotated date if the platform exposes one.
- Grep for third-party Action refs pinned to a mutable tag (`@v4`) vs a commit
  SHA; mutable tags are a supply-chain finding but downgraded severity if the
  action is from a `github/`/`actions/`-owned first-party publisher with a
  stable release cadence — note the distinction in the finding rather than
  flattening it.
- Confirm `pnpm audit --prod --audit-level=high` (referenced in
  `ci-gates.md`) genuinely runs as **advisory** (non-blocking) as documented,
  by checking the step's `continue-on-error`/exit-code handling — an
  advisory step that is actually blocking (or vice versa) is a doc-truth
  finding as well as a CI-security one.
- Check that no workflow with write permissions can be triggered by an
  edited comment, issue title, or other user-controlled string interpolated
  directly into a `run:` shell step (classic script-injection vector).

## What counts as a finding

- A workflow step with write-scoped secrets reachable from fork PR code
  before human review.
- Missing or overly broad `permissions:` on a workflow that touches secrets
  or pushes commits/tags.
- A required check documented as blocking that is not actually enforced by
  branch protection, or vice versa.
- Shell interpolation of untrusted input (PR title, issue body, branch name)
  in a `run:` step with write permissions.
- A secret whose blast radius exceeds what its usage requires (e.g. a
  full-repo-admin token used only to post a PR comment).

## Known blind spots

- Does not audit the security of the *product* (that's a separate,
  not-yet-built threat-model exercise — see `docs/backlog.md`'s Security &
  compliance section). This spec is CI/CD-pipeline-only.
- Cannot verify secret values themselves (rotation history, whether a leaked
  secret was ever committed) without platform audit-log access this audit
  does not assume.
- Third-party Action supply-chain risk beyond pin-vs-tag is out of scope
  (no SBOM of Action dependencies) — see [`dependencies.md`](dependencies.md)
  for the analogous check on the *product's* dependency tree.
