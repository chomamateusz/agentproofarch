# completeness audit

## Purpose

Answer the question the rest of the roster structurally cannot: what does
this product need that isn't documented as missing anywhere — not in the
PRD, not in the architecture's OUT-OF-SCOPE blocks, not in
[`docs/backlog.md`](../backlog.md)'s deferred-work register? Truth, CI,
dependency, dead-code and consistency audits all check something *present*
against a standard. Completeness starts from an external reference (the PRD's
own acceptance criteria, and a table-stakes checklist that exists
independent of this repo) and hunts for capabilities that were never noticed
enough to even get declared a non-goal. See
[`docs/audits/README.md`](README.md) for the founding example (the
2026-08-01 account-management gap) that motivated splitting this out from
`docs-truth.md`.

## Reference standard

Two references, checked independently:

1. **The PRD** (`docs/prd-agentproofarch-foundation.md`) — every user story's
   acceptance criteria and every functional requirement, checked against
   what's actually shipped. The PRD's own status note (lines 5-6) says "the
   sub-packages and their order are tracked on the board, not in this
   document" — that board isn't in the repo, so this in-repo ledger is the
   only artifact that maps stories to status — maintain it here, in this
   spec, as the living record.
2. **The table-stakes SaaS checklist** below — capabilities users of *any*
   multi-tenant SaaS product expect by default, independent of what this
   repo's own docs promise. A capability failing this list is a finding even
   if no PRD story ever mentioned it.

## Method

- For every PRD user story (US-001…US-028 and lettered sub-stories), re-read
  its acceptance criteria and cross-reference each criterion against the
  actual code path (route handler, use-case, UI component) — not against
  another doc's summary of the code path. Mark SHIPPED / PARTIAL / MOSTLY
  MISSING / NOT BUILT with the specific evidence (file:line) for the gap.
- For every item in the table-stakes checklist, search the codebase for the
  capability by its most likely surface: better-auth plugin config
  (`create-auth.ts` or equivalent) for anything auth-adjacent, `CAPABILITIES`
  / role-check constants for anything permission-adjacent, the router
  registration for anything endpoint-adjacent, and the web app's route table
  for anything UI-adjacent. Verify — don't infer from a plugin being
  installed that its feature is *reachable*: a better-auth plugin can be
  configured (`user.changeEmail`) but gated `enabled: false`, or mounted at
  the router level while having no UI, CLI, port, test or docs coverage —
  each of those is a different finding, not the same one collapsed together.
  The 2026-08-01 audit's cross-cutting finding is the pattern to check for
  first: a single blanket route mount (e.g. the entire better-auth handler
  behind one pattern) can make many sub-capabilities publicly reachable
  while zero individual route registrations name them.
- For every table-stakes item, also check whether its *absence* is
  documented anywhere (PRD OUT-OF-SCOPE, architecture OUT-OF-SCOPE block, or
  a `docs/backlog.md` entry with a named trigger). Undocumented absence is
  the actual finding — a documented, deliberately-deferred capability with a
  named trigger is not a completeness gap, it's the register working as
  designed.
- Check for capabilities that, if missing, actively break a *different*,
  already-shipped feature (the 2026-08-01 audit's 2FA finding: TOTP
  enrolment ships, but the sign-in challenge doesn't, so enrolling locks a
  user out). These rank above simple absences because they're regressions
  disguised as gaps.

## What counts as a finding

- A PRD acceptance criterion or functional requirement with no matching
  code path, or a code path that implements a materially reduced version
  without the reduction being documented (silent scope reduction).
- A table-stakes checklist item that is MISSING or PARTIAL with no
  corresponding entry in `docs/backlog.md` carrying a named trigger.
- A shipped feature broken by an *un*shipped adjacent one (the 2FA
  lockout pattern) — flag as higher severity than a plain absence.
- Two normative docs that disagree on whether a story is in scope (the
  PRD-vs-FR-8/§6 invitations contradiction is the worked example) with no
  adjudicating errata resolving it.

## Known blind spots

- This audit is only as good as the checklist and PRD it's checked against;
  a table-stakes item nobody has added to the list below is invisible to
  it, same structural blind spot one level up. Extend the checklist when a
  new gap class is found (that's how "2FA sign-in challenge" got added
  below) rather than treating the list as closed.
- Does not judge whether a missing capability is *worth* building yet — that
  is a product/trigger decision for `docs/backlog.md`, not this audit. This
  audit's job stops at "documented or not," not "prioritized or not."
- Severity labels here (table-stakes / nice-to-have / enterprise
  table-stakes) are a starting judgment call, not a scored rubric — a repeat
  audit should revisit them rather than copy them forward unchanged.

## Table-stakes SaaS checklist (living list)

Statuses below were verified during the 2026-08-01 completeness audit
(report: `~/repositories/claude-tmp/agentproofarch-audit-day/completeness-audit.md`,
not in-repo — kept here as the durable record per this spec's own method).
Re-verify status against current code on every re-run; do not carry a status
forward without re-checking its evidence line.

| # | Capability | Status | Evidence | Severity |
|---|---|---|---|---|
| 1 | Password change | PARTIAL (provider-only) | `/api/auth/change-password` reachable via the blanket better-auth mount (`apps/server/src/app.ts`); no port, UI, CLI, test or docs coverage. | table-stakes |
| 2 | Forgot password | MISSING | Endpoint mounted but refuses — `sendResetPassword` unset in the auth config. `EmailPort` exists and is ready to carry the reset email. | table-stakes |
| 3 | Email change + re-verify | MISSING | Gated behind `user.changeEmail.enabled`, never set. `members.email` is a provider-decoupled snapshot with no refresh path of its own (see `docs/provider-coupling-audit.md`) — shipping email-change without also wiring that sync would silently desync it. | table-stakes |
| 4 | Email verification at signup | MISSING | Verification flag never set/read despite US-007's AC and FR-25 both demanding it; `AuthenticatedUser` ships as `{userId, email, name}` with no `emailVerified` read path, though the column exists. With ADR-0010's default `TENANT_CREATION=open`, an unverified throwaway email can become a tenant owner. | table-stakes |
| 5 | Account deletion / export (GDPR) | MISSING / PARTIAL | `delete-user` disabled despite PRD §3.4 naming it; tenant-side export is single-member JSON only, with no bulk/CSV path across a tenant's members. | table-stakes |
| 6 | Session list + revoke | PARTIAL (provider-only) | `/list-sessions`, `/revoke-session(s)` mounted and reachable, unsurfaced anywhere in UI/CLI. No "sign out everywhere" flow, which capability #1 (password change) needs to be trustworthy. | table-stakes |
| 7 | Profile name / avatar | MISSING | `user.image` and `update-user` exist in the auth config, unused; `/api/me` returns no image field; display name has no edit path anywhere in the app. | name: table-stakes; avatar: nice-to-have |
| 8 | Member removal / role change | PARTIAL | Staff revoke ships (with a last-owner guard and a confirmation dialog). Role change is absent — `grantAdmin` is a deliberate no-op on an existing grant, so there is no promote/demote path and no ownership transfer. | table-stakes |
| 9 | Tenant rename / delete | MISSING | The capability registry (`demo/core/domain/authorization.ts`) defines 14 capabilities, none of them `tenant:rename` or `tenant:delete`; tenants are immutable and undeletable once created. | table-stakes |
| 10 | Invite resend / revoke | MISSING (deliberate, but contradicted) | No invitation concept exists at all; declared out of scope by FR-8/§6 while US-013/US-018 both demand it — see the PRD-internal contradiction noted above. | table-stakes / conscious-defer once adjudicated |
| 11 | Audit log of auth events | MISSING (declared) | Explicitly named OUT OF SCOPE in `docs/architecture.md` with a stated trigger ("a specific compliance or contractual requirement") — this is the register working as intended, not a completeness gap. | nice-to-have / enterprise table-stakes |
| 12 | Login notification emails | MISSING (unregistered) | Not mentioned in PRD, architecture, or backlog — genuinely un-noticed rather than deferred. | nice-to-have |
| 13 | Lockout / rate limits | PARTIAL — mostly present | DB-backed rate limiting is on by default; per-route limits exist for sign-in, sign-up, change-password and change-email, and a looser window on reset paths. Missing: per-account lockout (current limiting is IP-only, so distributed credential stuffing is unaffected), and no limiting on the app's own `/api/*` surface beyond the auth routes. | throttling exists; account-lockout gap is table-stakes |
| 14 | Terms / privacy surfaces | MISSING | No terms/privacy pages, no signup consent checkbox; the footer carries only a build stamp. `members.marketingConsents` exists as a column and is never written to. | table-stakes |
| 15 | 2FA sign-in challenge | MISSING — breaks a shipped feature | TOTP enrolment ships; the sign-in-time challenge does not, so the client adapter treats `twoFactorRedirect` as a successful login and the login page navigates straight to `/app`, producing a bounce loop for any user who enrolled. No backup-code path, no way to disable 2FA without an active session. The repo's own two-factor integration test documents this wall. | **P1 — regression, not just a gap** |

**Cross-cutting pattern to re-check on every run:** the app mounts the
entire better-auth router behind one pattern match, so any better-auth
plugin capability (`change-password`, `update-user`, `list-sessions`,
`revoke-*`, `two-factor/*`, and any plugin added later) becomes publicly
reachable the moment the plugin is configured, with zero individual route
registration lines to grep for and zero automatic coverage in contract
tests, ports, CLI, or the threat model. Every new better-auth plugin added
to the auth config should be treated as shipping a new public surface by
default, and audited as one.
