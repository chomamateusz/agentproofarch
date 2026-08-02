# ci-security audit

## Purpose

Verify the CI/CD pipeline and its secrets cannot be abused to run arbitrary
code, exfiltrate credentials, or push unreviewed changes past the gates
described in [`website/docs/operations/ci-gates.md`](../../website/docs/operations/ci-gates.md)
and [`website/docs/operations/ai-review-gate.md`](../../website/docs/operations/ai-review-gate.md).

## Standard reference

**OpenSSF Scorecard 5.5.0** check definitions
([`docs/checks.md`](https://github.com/ossf/scorecard/blob/main/docs/checks.md))
for the repository-posture half, and **SLSA v1.2** Build track for the
artifact half.

Scorecard names, in its own vocabulary, most of what this spec already greps
for by hand:

| Scorecard check | This spec's method step |
|---|---|
| `Token-Permissions` | The `permissions:` block; repo-default is a finding |
| `Dangerous-Workflow` | `pull_request_target` and script-injection checks |
| `Pinned-Dependencies` | Mutable action tag vs commit SHA |
| `Branch-Protection` | `main-gates` actually listing the documented required checks |
| `Code-Review`, `CI-Tests` | Review and test enforcement on the default branch |
| `Security-Policy`, `Binary-Artifacts`, `SAST`, `Webhooks` | Posture checks this spec did not previously name |
| `Vulnerabilities` | Owned by [`dependencies.md`](dependencies.md), not here |

**SLSA position, stated rather than left unexamined:** the release artifacts
(the Docker image from `selfhost.yml`, the GitHub release from
`tag-release.yml`) carry no provenance, which is **Build L0**. That is a
position, not a target — L1 (provenance exists) and L2 (signed provenance
from a hosted platform) are owner decisions, not defaults this audit assumes.
An audit run states the level; it does not treat L0 as a finding.

**What is not claimed:** a Scorecard score is not a security verdict, and
this repo deliberately diverges from several checks (see *Automatable
checks*). Scorecard scores a repository against a general model; it does not
know this repository's doctrine, and a run that chases the number instead of
reading the check is doing the opposite of this audit.

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

## Automatable checks

`scorecard.yml` (weekly cron plus manual dispatch, **advisory and unrequirable
— see below**) runs `ossf/scorecard-action` and uploads SARIF to the Security
tab. Read its latest run **before** starting an audit and treat every check as
*input*, then record each place this repo's doctrine deliberately diverges.

| Check | Expected here | Why |
|---|---|---|
| `Token-Permissions`, `Pinned-Dependencies` | Should score well | Every workflow declares `permissions:` and every action is SHA-pinned |
| `Security-Policy` | 0 | No `SECURITY.md` — owner decision, not an oversight this audit fixes silently |
| `Dependency-Update-Tool` | 0 | No bot; a bot must respect the `minimumReleaseAge: 4320` cooldown, so "fix the score" is the wrong instinct — see [`dependencies.md`](dependencies.md) |
| `Code-Review` | Weakened | No `CODEOWNERS`; the rulesets do require a pull request, which the check only partly detects |
| `SAST` | Low | ESLint plus the custom layer rules are not detected as SAST |
| `Branch-Protection` | Reads poorly | Repository rules read with the default `GITHUB_TOKEN`; the required set is verified by `gh api …/rulesets` in the method above, not by this score |
| `Fuzzing`, `Packaging`, `Signed-Releases`, `CII-Best-Practices` | Not applicable | Ignore rather than chase |

The job cannot be a gate and never will be: `ossf/scorecard-action` supports
`push` and `schedule` on the default branch, and documents `pull_request` and
`workflow_dispatch` as experimental — it produces no per-PR status to require.
That is a fact about the tool, not a policy choice.

Not automatable at all, and therefore the reason this spec exists: the flake
ruling, whether the required-check set matches what the docs claim, the
`ai-review` token being a subscription credential rather than a repo-write
PAT, the agent-boundary rules, whether the advisory `pnpm audit` step is
genuinely advisory, and the first-party-publisher nuance on mutable tags.

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
