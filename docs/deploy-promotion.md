# Deploy promotion runbook (Vercel target)

The click-by-click companion to [architecture.md](architecture.md) §Environments.
That section is normative: **no GitHub event reaches production; production is
promoted by hand, by the owner, inside Vercel.** This file is the procedure that
makes that true and keeps it true. Nothing here is agent-runnable — every step is
an owner action on a human-only device.

Vocabulary: the **last promoted SHA** is the commit currently serving production
(read it off `/api/health` — see [architecture.md](architecture.md) §Health &
deploy attestation). A **staging/preview deployment** is any auto-built Preview
(from `main` or a PR). **Promotion** re-points the production alias at one of
those existing builds; it never rebuilds.

## a. One-time flip: put a project on the manual-production topology

Do this once per Vercel project. It removes the Git → production trigger.

1. Vercel dashboard → the project → **Settings → Git**.
2. **Production Branch**: change it from `main` to an unused ref that is never
   pushed — e.g. `production-manual`. (The ref does not need to exist as a real
   branch; it only has to be a name nothing pushes to.) Save.
3. Confirm the mapping: from now on a push or merge to `main` builds a **Preview**
   deployment, not a Production one. Assign `main`'s Preview a stable **staging
   alias** (Settings → Domains, or a `vercel alias`) so staging has a fixed URL.
4. **Verify nothing auto-deploys production.** Push a trivial commit to `main`,
   wait for the deploy, and confirm in **Deployments** that the new build is
   tagged *Preview* (not *Production*) and that the production alias/`/api/health`
   SHA is unchanged. If a push still lands on Production, the Production Branch was
   not saved — repeat step 2.
5. **Re-verify the post-deploy production smoke trigger** (unverified until first
   promotion — see [backlog.md](backlog.md) §Verification residuals). A manual
   "Promote to Production" may emit different GitHub deployment events than a
   `main` push — possibly no `deployment_status` — and
   [../.github/workflows/post-deploy-smoke.yml](../.github/workflows/post-deploy-smoke.yml)
   fires on `deployment_status` for the `Production` environment. After the first
   real promotion, check the repo's deployments/Actions: if the promotion produced
   no `deployment_status` for `Production`, adjust the workflow trigger (e.g. add a
   `workflow_dispatch` the owner runs post-promote, or a Vercel deploy hook that
   posts the SHA) so the production SHA attestation still runs.

## b. The promotion ritual (every production release)

Performed by the owner, from a human-only device — dashboard (works from a phone)
or `vercel promote` from a logged-in workstation.

1. **Review the diff since the last promoted SHA.** Read the last promoted SHA
   off production `/api/health`, then read `git diff <lastPromotedSHA>..<candidate>`.
   This diff review is the only defense at the irreducible seam (promoted code runs
   with production secrets) — do not skip it because the gates are green. Gates
   prove the code *runs*; the diff review is what proves the code is *the code you
   meant to ship*.
2. **Confirm the gates are green on that exact SHA.** The candidate deployment
   must be a build whose commit passed `check` and `smoke` in CI. Do not promote a
   build that skipped or red-flagged a gate — a fail-closed review that "could not
   run" is red, not promotable.
3. **If the diff includes a migration, take a Neon snapshot / PITR point first.**
   A constraint-adding or destructive migration can abort mid-`ALTER` against real
   data (see [architecture.md](architecture.md) §Constraint-adding migrations). Take
   a Neon branch-from-timestamp restore point on the `production` branch and note
   it, so a bad migration is a one-command rollback, not an incident.
4. **Promote in the dashboard.** Deployments → the chosen build → **Promote to
   Production** (or `vercel promote <deployment-url>`). This re-points the
   production alias at that existing build; no rebuild.
5. **Verify the post-deploy SHA attestation.** Confirm production `/api/health`
   now reports the promoted commit's `sha`, and that `smoke:remote` ran green for
   it (the `EXPECTED_SHA` equality in
   [../.github/workflows/post-deploy-smoke.yml](../.github/workflows/post-deploy-smoke.yml)).
   If the workflow did not fire (see §a step 5), run the attestation check by hand
   until the trigger is fixed.

**Rollback** is the same ritual in reverse: promote the previous known-good
deployment. Because promotion never rebuilds, the previous build is still present
and promoting it is instant. A migration in the rolled-back release is undone via
the Neon PITR point taken in step 3, not by "promoting older code" (code rollback
and schema rollback are separate — old code against a new schema can still break).

## c. The five standing controls — checklist and WHY

Each is a property of the environment, not a rule an agent is asked to remember.

1. **No Git-integration path to prod.** Production Branch is an unused ref (§a).
   *WHY:* agents have maximum GitHub freedom by design; the security wall is that
   no GitHub event — merge, force-push, workflow dispatch, deploy-hook retrigger —
   can trigger a production deploy, because production has no automatic trigger.
2. **Zero platform-CLI sessions on agent machines + Bash-hook ban.** No
   `vercel`/`neonctl`/cloud-CLI login persists on any machine an agent drives, and
   the agent harness's Bash hook denies launching them. *Executed today:* `vercel
   logout` done, `.env.local` removed; the hook patch banning `vercel`/`neonctl`
   was handed to the owner to apply. *WHY:* a logged-in CLI is a standing
   credential to production infra; a blocked command is enforcement, a documented
   "please don't" is not.
3. **All production env vars marked Sensitive (write-only).** In Vercel's env UI,
   every production variable is set Sensitive so its value cannot be read back,
   only overwritten. *WHY:* limits blast radius if a session or export is
   compromised — secrets are entered once by a human and never re-exfiltrated
   through the dashboard/CLI read path.
4. **Passkey / 2FA on the Vercel login; sessions only on owner devices.** *WHY:*
   the login is the single gate to promotion and to the secret store; phishing-
   resistant auth on it is the account-takeover defense.
5. **Platform-independent DR.** Cold standby on the owner's VPS via the Docker
   deploy target, an hourly `pg_dump` cron on the VPS, and Neon PITR. *WHY:* the
   whole topology assumes Vercel + Neon; a total-platform loss (account
   suspension, provider outage) must be recoverable off both — the same commit
   deploys to Docker + Postgres, and the hourly dump bounds data loss independently
   of Neon's own retention.

Operating-hygiene context for these lives in
[../demo/README.md](../demo/README.md) §Operating hygiene for agent-driven repos.

## d. What agents may do

**Everything on GitHub, nothing on Vercel.** Agents merge, branch, dispatch
workflows, open and land PRs, and drive preview + staging deployments freely —
that is the whole development environment. No agent touches the Vercel dashboard,
holds a platform-CLI session, or promotes anything. Promotion is the owner's, by
hand, always.
