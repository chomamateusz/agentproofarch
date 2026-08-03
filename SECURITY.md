# Security policy

This is a free, MIT-licensed project maintained by one person. That fact is the
policy: everything below is written so a reporter knows what they will get, not
so the repository looks compliant.

## Supported versions

Releases follow SemVer, cut by a dedicated release pull request to `main` and
promoted from there
([ADR-0014](docs/decisions/0014-release-versioning-and-version-surfaces.md),
[Versioning & releases](https://chomamateusz.github.io/agentproofarch/operations/versioning-and-releases)).

**Only the latest released minor of the current major line is supported.** There
are no maintenance branches and no backports to earlier minors: a fix ships in
the next release off `main`, and upgrading to it is the remedy. The released
version is the newest `## vX.Y.Z` marker in [CHANGELOG.md](CHANGELOG.md), and a
running deployment states its own at `/api/health`.

| Version | Supported |
|---|---|
| 1.2.x | ✅ |
| < 1.2 | ❌ — upgrade |

## Reporting a vulnerability

**Do not open a public issue, pull request or discussion for a vulnerability.**

Email **<kontakt@coderoad.pl>** — the maintainer's contact through
[CodeRoad.pl](https://coderoad.pl), named in the [README](README.md). Include
the affected version or commit, the impact you believe it has, and the smallest
reproduction you have; a CLI transcript or a failing test against `demo/` is the
fastest possible report, because that is how everything else in this repository
is verified.

GitHub's private vulnerability reporting is **not enabled** on this repository
today, so the Security tab offers no private channel — email is the only one.

## What to expect

Best effort, from a solo maintainer, with no SLA and no bug bounty. Concretely:
an acknowledgement when the mail is read rather than within a fixed window, a
fix prioritised over other work once the report is confirmed, and credit in the
changelog entry unless you ask otherwise. If a report goes unanswered for two
weeks, assume it was missed rather than ignored and send it again. The MIT
licence's warranty disclaimer is not suspended by this file.

## Scope

**In scope — the foundation code, which is the actual asset:** `demo/` (core,
adapters, apps, CLI), the layer enforcers, the CI workflows under
`.github/workflows/`, and the self-host Docker stack. Anything that lets code
cross a layer boundary undetected, leaks across a tenant boundary, escalates
privilege, or turns a pull request into repository write access belongs here.

**Out of scope — the public demo deployment.** <https://agentproofarch.vercel.app>
is a playground: its credentials (`demo@agentproofarch.dev` / `demo-agentproof-1234`) are
published in the README, its data is seeded and disposable — every deployment
reseeds the fixture back to those published credentials — and it runs on
free-tier hosting. Signing in with those credentials, reading or destroying
what you find there, and rate-limit or capacity findings against that instance
are not vulnerabilities. Findings in the platforms underneath it (GitHub,
Vercel, Neon) belong to those vendors, not here.

Two kinds of weakness are already on the record, and they are on it for
different reasons. **Deferred** ones sit in
[`docs/backlog.md`](docs/backlog.md) §Security & compliance against a written
trigger — the first external security review or the first enterprise
questionnaire — and include the account-enumeration posture (R2-31:
registration and login reveal account existence through Better Auth defaults).
**Open findings** are not deferred at all: the missing 2FA sign-in challenge is
carried by [`docs/audits/completeness.md`](docs/audits/completeness.md) (row
15) as a **P1** — TOTP enrolment ships, the sign-in-time challenge does not, so
an enrolled user meets a login bounce loop and there is no backup-code path.
Either way the record exists, so a report is only useful if it shows the
problem is worse than the record admits.

## How this repository audits itself

Security posture here is reviewed against written specs, not vibes:
[`docs/audits/`](docs/audits/) holds one spec per recurring audit — purpose,
the versioned standard it anchors to, method, what counts as a finding, and the
blind spots that audit cannot see
([index and doctrine](docs/audits/README.md)). The two that bound this policy
are [`ci-security.md`](docs/audits/ci-security.md) (pipeline and secrets,
anchored to OpenSSF Scorecard 5.5.0 and a stated SLSA position) and
[`dependencies.md`](docs/audits/dependencies.md) (third-party packages, anchored
to OSV / the GitHub Advisory Database). A green scanner is not a passing audit
in either of them, and a Scorecard number is not a security verdict.
