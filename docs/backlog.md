# Deferred-work register

The audit's DEFER lists (round-1 and round-2 consensus, 2026-07-20) and residuals
from later package verifications, persisted so nothing lives only in session
notes. Entries here are **accepted as real but deliberately not built**; each has
a named trigger where the audit assigned one. When a trigger fires, the entry
graduates into an ADR or an implementation slice — it never gets built silently.

This register is descriptive, not normative: nothing in it weakens
[architecture.md](architecture.md). If an entry contradicts the architecture,
the architecture wins until the entry is adjudicated.

## Day-2 operations (trigger: first real production incident, or the first
paying tenant — whichever comes first)

- Rollback doctrine and migrate-vs-deploy ordering.
- Alerting, uptime targets, SLOs; runbooks and incident severity ladder.
- Self-host operations: backup cadence, upgrade contract, Vercel/Docker parity
  matrix.
- DB performance doctrine: indexing rules, slow-query surfacing.
- Failure-mode matrix per external dependency; overload/backpressure stance.
- Process lifecycle: SIGTERM drain; pg pool configuration — including
  `pool.on('error')` (an idle-client error currently crashes the Node process)
  and the boot-with-dead-DB posture (E2 verification residuals, 2026-07-19).

## Security & compliance (trigger: first external security review, or first
enterprise customer questionnaire)

- Threat model; supply chain (SBOM, dependency scanning).
- Secrets and crypto handling cross-target (Vercel env vs compose env).
- Session policy numbers (lifetimes, rotation); password policy and
  account-enumeration posture (R2-31 — registration/login currently reveal
  account existence through better-auth defaults).
- Support access / break-glass procedure; abuse quotas (tenant-creation
  velocity); vulnerability management.
- Data governance matrix: classification, DSAR flow beyond member export,
  legal holds.

## Product platform (trigger: named per entry)

- Feature flags / kill switches — trigger: first dark launch.
- Forms doctrine (§Frontend promises one; none exists) — trigger: first
  multi-step or dynamic form.
- A11y: WCAG target + axe pass in e2e — trigger: first public-facing product UI.
- i18n insurance rules — trigger: first non-English tenant requirement.
- Product analytics + consent — trigger: first growth instrumentation ask.
- Visual-regression tooling — **none today** (decision recorded, not built). The
  recommended path is Playwright `toHaveScreenshot()` reusing the existing e2e
  Chromium harness, with **baselines generated in CI, never on a dev Mac** (the
  flake doctrine — a Mac-rendered baseline drifts against the Linux CI runner).
  Storybook + Lost Pixel is the component-isolation alternative when the need is
  per-component rather than per-page. Chromatic is excluded (paid). Trigger: the
  first UI-heavy consumer of the foundation.
- ~~US-020 Vercel domain-provisioning adapter (`DomainPort`)~~ — **BUILT** (the
  trigger fired: tenant subdomains bridged through company DNS with one plain
  wildcard CNAME `*.agentproofarch.coderoad.pl → cname.vercel-dns.com`, and a
  records-only zone can carry no DNS-01 wildcard cert, so every per-tenant host
  needs its own HTTP-01 cert and therefore its own programmatic attach).
  `adapters/domain-provisioning/vercel.ts` + `DOMAIN_PROVISIONER=vercel` ship with
  `VERCEL_TOKEN`/`VERCEL_PROJECT_ID`(+`VERCEL_TEAM_ID`) and a boot refusal when
  the block is incomplete (see
  [architecture.md](architecture.md#ports-complete-list)). Hobby
  caps at 50 custom domains per project. The production add path was confirmed
  live on 2026-07-29 — the observation is written down in
  [§US-020 live adjudication record](#us-020-live-adjudication-record-2026-07-29)
  below, and that record is the only thing any other page may cite for it.
  **Residual, still open:** the run also carried one pre-verification
  `domain check`, but post-verification `check` acceptance and `remove` remain
  unrecorded live; both rest on the stubbed-`fetch` suite.
- Cost guards and attribution — trigger: first surprising vendor bill.
- CLI distribution + version handshake — trigger: first external CLI consumer.
- Per-tenant IdP / enterprise SSO (tenant-configured SAML/OIDC federation) — trigger: first enterprise customer ask.
- Billing/entitlements; search; load testing; IaC — trigger: the respective
  product need.
- Foundation upgrade contract (R2-29): release manifest, tagged revisions,
  change classes, security-advisory channel, conformance command — trigger:
  the second app consuming this foundation.
- Sentry CSP trigger guard (R2-30): enabling `VITE_SENTRY_DSN` requires adding
  the ingest host to `connect-src` for that environment (documented manual
  step); when the trigger first fires, also add a deployed probe so the pairing
  cannot be fumbled.

## Vendor-fact refresh (trigger: quarterly, or before relying on the fact)

- Re-verify Vercel Queues availability and Neon restore windows against primary
  sources; add "as of" dates beside every vendor limit cited in
  jobs-research.md and architecture.md §backups.

## Unlegislated demo decisions (trigger: the next edit touching each)

- `maxDuration: 30` as the de-facto latency budget.
- Theme-mode / tenant-accent theming seam. (Visual-regression tooling role is
  now recorded under §Product platform.)
- dist-freshness cross-reference; coverage-ratchet ownership.
- Client retry/GC numbers; CLI config precedence; SPA fallback semantics.

## Verification residuals (accepted, report-only)

- Slug VO drops diacritic letters instead of transliterating: a fully
  diacritic Polish tenant name yields a near-empty slug (S6 verification,
  2026-07-21). Trigger: first real Polish-named tenant complaint, or the next
  edit to `core/domain/slug.ts`.
- `domainNameSchema` accepts raw IPv4 (`192.168.1.1`) as a custom domain
  (S6 verification). Trigger: next edit to the domain chain.
- Revoked-staff denial is `tenant_not_found`, byte-identical to a stranger's —
  deliberate existence-hiding, recorded so nobody "fixes" it to `forbidden`
  (S2 verification).
- Cross-subdomain session on a real base domain (switcher keeps the session in
  prod) is documented but not locally testable (S6). Trigger: first custom
  base-domain deployment — verify live, then delete this row.
- Post-deploy production smoke trigger — **resolved by the topology.** Production
  is now released by merging an owner-approved PR to the `production` branch, and
  a branch merge is an ordinary push that emits `deployment_status` for the
  `Production` environment, so `post-deploy-smoke.yml` fires as-is. The old
  concern (a dashboard "Promote to Production" possibly emitting a different or no
  `deployment_status`) does not apply to the PR-merge model
  ([deploy-promotion.md](deploy-promotion.md) §b step 6).

## US-020 live adjudication record (2026-07-29)

The one dated record behind every "production add path confirmed live" sentence
in this repository and on the published site. Nothing else may assert that claim
on its own; pages cite this record.

**Story / queue item.** US-020 (Vercel domain-provisioning adapter,
`DOMAIN_PROVISIONER=vercel`); closes DECIDE **A1-S5**.

**Who and when.** Owner-supervised session on **2026-07-29**. The owner held the
DNS and the credential; the agent drove the commands and read the output back.

**Method.** A live run against the deployed production app at
`https://agentproofarch.vercel.app`, driven end-to-end through the **public
CLI** — no test harness, no stub, no direct call to the provider API. A fresh
account was registered for the run, so nothing was reused from seeded or
developer state.

**What was observed, in order.**

1. The fresh account created two tenants: `acme-livetest-c1f63c2a`
   (`9bc62c75-c453-4aea-b08f-25e9ad449c0a`) and `globex-livetest-c1f63c2a`
   (`043c0505-3fa1-4eff-b792-1d102855b26b`).
2. `domain add` attached `acme.agentproofarch.coderoad.pl` (domain row
   `1abfbd0e-8bea-45fe-a8ca-557633b850f3`) and
   `globex.agentproofarch.coderoad.pl` (`b9f55f7d-b6a9-40e4-a187-2b234b09e28e`)
   to the hosting project through the **real Domains API**. Both came back
   *attached, unverified*.
3. The parent domain was already claimed by another hosting account, so the API
   demanded an ownership challenge — a TXT record
   `vc-domain-verify=<host>,<token>` at `_vercel.coderoad.pl`. The deployed app
   the run drove (sha `5138f884…`, which predates this change) could not show
   it: `DomainPort.provision` returned `void` and the provider's verification
   payload was discarded, so nothing reached the port, the contract or the CLI.
   The owner read both `vc-domain-verify` values off the **hosting provider's
   dashboard** and configured them at the parent by hand. That manual detour is
   exactly the gap the `requiredDnsRecords` change in this PR closes.
4. `domain check` was invoked **exactly once** in the whole run, on
   `acme.agentproofarch.coderoad.pl`, while the ownership challenge was still
   pending. An abridged excerpt as captured in the session log — the full stored
   `tenantDomain` fields were not preserved in the capture:

   ```json
   {"ok":true,"data":{"domain":{"verified":false},"check":{"resolved":false,"detail":"acme.agentproofarch.coderoad.pl is attached to the Vercel project but not verified yet"}}}
   ```

5. Verification completed and certificates were issued for both hosts. No
   further `domain check` was run: the verified state was established by TLS and
   `/api/health` over HTTPS, not by the command.
6. Final state: both hosts serve **HTTP 200**; `/api/health` returns
   `{"version":"1.0.0","sha":"5138f8846aac9516eba47a7ee47b0351360c8a61"}`; and
   the login page renders the tenant slug resolved from the `Host` header, so
   host → tenant resolution works on a real custom domain.

**What this record does and does not cover.**

- Live-observed: the **production runtime path of `provision`** (`domain add`)
  end to end, plus the **one pre-verification `domain check`** in step 4 and its
  envelope.
- Unrecorded: `domain check` **after** verification succeeded — no such
  invocation happened, so its acceptance rests on the offline suite alone — and
  `domain remove`, never invoked at all. The verification residual above stands
  for both. The **record-surfacing path added in this PR** is unrecorded too:
  the run confirmed that attach succeeds and that the provider demands the
  ownership TXT, but the records themselves came off the provider dashboard, so
  carrying them through the port, the contract and the CLI is offline-tested
  only, against stubbed provider responses.
- **No gate can repeat it.** The `VERCEL_TOKEN` that made the run possible lives
  only in the production runtime environment; CI and the build machine hold
  none, by design. This record is a human-witnessed observation, not a
  reproducible check.
- **The adapter's automated tests are unchanged by it**: they still run offline
  against a stubbed `fetch`. Nothing in this run is asserted by `check`.

## Optional second reviewer (shipped 2026-07-26)

- **CodeRabbit runs as the optional second reviewer.** The owner installed the
  GitHub App and `.coderabbit.yaml` configures it: chill profile, no
  request-changes, doctrine-pointing path instructions, noise exclusions. It is
  **advisory only** — it comments and posts a non-required `CodeRabbit` status;
  the fail-closed `ai-review` gate remains the sole enforcement tier, so
  CodeRabbit can never turn a real `FAIL` green nor block a merge itself.

## Audit tooling (trigger: named per entry)

Deferred deliberately while anchoring the [audit specs](audits/README.md) to
standards on 2026-08-01. Each spec ships stating the gap; none of these is a
prerequisite for running its audit by hand.

- **`@axe-core/playwright` in the existing Chromium jobs** — the automated half
  of [`audits/accessibility.md`](audits/accessibility.md). The `e2e` and
  `visual` jobs already boot Chromium, so wiring it is cheap; the spec's manual
  keyboard, focus and alt-text passes stay mandatory either way, because
  automation identifies roughly 57% of issues and no conformance at all.
  *Trigger: owner decision.*
- **Lighthouse over the web application** — `lhci.yml` measures the
  documentation site only. A static run over `dist/web` would yield real bundle
  and resource budgets for the app shell but no authenticated route (every
  `/api/*` call 404s against LHCI's own server); measuring the real thing means
  booting the e2e stack and signing in from a `puppeteerScript`, a second login
  implementation beside the Playwright fixtures. *Trigger: a written frontend
  performance SLO, or the first user-visible performance regression.*
- **Backend latency and load measurement** — nothing measures it, and no SLO
  exists to measure against; CI runners are too variable to be authoritative
  about capacity anyway. *Trigger: a latency SLO written down somewhere
  normative.*
- **Promoting Lighthouse assertions from `warn` to `error`** — see
  [`audits/performance.md`](audits/performance.md); a pre-1.0 lab tool on a
  shared runner cannot be a hard line while the flake ruling forbids
  rerun-to-green. *Trigger: stable numbers over weeks, plus an owner decision.*
- **Scorecard follow-ups** — [`SECURITY.md`](../SECURITY.md) landed with the
  first run's other mechanical fixes, and `CODEOWNERS` and the advisory SAST job
  (`codeql.yml`, see [`audits/ci-security.md`](audits/ci-security.md)) have
  landed since; a dependency update bot is what remains. A bot must respect the
  three-day `minimumReleaseAge` cooldown before it is an improvement.
  *Trigger: owner decision, per item — never "the score said so".*
- **GitHub private vulnerability reporting** — off today, so
  [`SECURITY.md`](../SECURITY.md) points at email and says so. Enabling it
  gives reporters a private channel inside the Security tab and an advisory
  workflow with a CVE request attached. *Trigger: owner decision (a repository
  setting, not a code change).*
- **Scorecard `publish_results`** — currently `false`. Turning it on publishes
  this repo's score to the public OpenSSF API, enables the badge, and replaces
  OpenSSF's own weekly scan with these runs. *Trigger: owner decision.*
- **SLSA Build L1+ provenance** on the Docker image and release artifacts;
  [`audits/ci-security.md`](audits/ci-security.md) states the current L0
  position rather than treating it as a finding. *Trigger: owner decision.*

## Open owner decisions (not deferred — awaiting answers)

Tracked in the DECIDE queue: B5 (agent operating envelope), C1 (transactions
doctrine on neon-http), C3 (invariant placement), C4 (backfill executor),
F2 (concurrent-change protocol); plus the provider/secret choices blocking
A1-S4 (magic-link email provider, social OAuth credentials).

**A1-S5 is closed on evidence, not on assertion.** It closed on **2026-07-29**,
when an owner-supervised live run drove `domain add` through the public CLI
against the deployed production app and attached two real tenant hosts over the
Domains API, through the ownership-TXT challenge, to verified hosts serving
HTTP 200. The full observation — who, when, method, tenant and domain
identifiers, and the final health `sha` — is
[§US-020 live adjudication record](#us-020-live-adjudication-record-2026-07-29)
above; that record is what closes this item. The same run carried one
pre-verification `domain check`; post-verification `check` acceptance and
`remove` stay outside its scope and remain the US-020 verification residual.
**F1 (AI-reviewer gate) is decided and built** — the
fail-closed `ai-review` workflow ships with `CLAUDE_CODE_OAUTH_TOKEN_1`; see
[../demo/README.md](../demo/README.md) §Operating hygiene for agent-driven repos.
