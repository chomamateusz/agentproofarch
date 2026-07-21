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
- Cost guards and attribution — trigger: first surprising vendor bill.
- CLI distribution + version handshake — trigger: first external CLI consumer.
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
- Theme-mode / tenant-accent theming seam; visual tooling (screenshot/diff)
  role.
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

## Open owner decisions (not deferred — awaiting answers)

Tracked in the DECIDE queue: B5 (agent operating envelope), C1 (transactions
doctrine on neon-http), C3 (invariant placement), C4 (backfill executor),
F2 (concurrent-change protocol); plus the provider/secret choices blocking
A1-S4 (magic-link email provider, social OAuth credentials), A1-S5
(`VERCEL_TOKEN` for US-020) and F1 (AI-reviewer gate key).
