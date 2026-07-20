# Observability

Normative policy. Sources: gap analysis in
[frontend-comparison.md](frontend-comparison.md); the wide-events model from
"Your logs are lying to you" (Boris/Cloudflare via Theo's review, transcribed
2026-07-12 — T3 Chat runs this in production on OTel + Axiom).

## The standard and the style

- **Instrumentation standard: OpenTelemetry.** `@opentelemetry/api` is a
  dependency-free facade that no-ops until an SDK is registered in the
  composition root — which makes it *vocabulary* under our dependency policy:
  core may annotate through it, adapters/exporters are wired at the edges,
  and the vendor is a config choice, never a code change. No `ObservabilityPort`
  — the facade is the industry's port already (wrapping it would be port
  theater).
- **Practice: wide events (canonical log lines), not step logging.** Do not
  log what the code is doing; build ONE context-rich event per request per
  service hop. As the request progresses, *annotate the active span* (user id,
  tenant id, subscription tier, business ids, feature flags, error context,
  perf counters) and emit once at the end. OTel without this discipline is
  "bad telemetry in standardized formats".
- **High cardinality is the point.** user/tenant/session/trace ids and
  business ids are the most valuable fields; never strip them to save
  volume — control cost with tail sampling instead: always keep errors, slow
  requests (>p99) and flagged accounts; sample the happy path (1–5%).

## Wiring (three chokepoints, zero feature changes)

Errors and traces already flow through single points; instrumentation attaches
there, never inside features or use-cases:

| Point | What it does |
|---|---|
| `apps/server` Hono middleware | opens the request span, reads `traceparent`, annotates infra context, emits the wide event in `finally`; error handler records `AppError` fields as span attributes |
| `apps/web` root error boundary + `QueryCache.onError` | reports to Sentry with the active trace id; the error fallback **shows the trace id** so a user can paste it into a support message |
| `core/client` `request()` | injects W3C `traceparent` into every HTTP call — FE→BE trace unification is a one-place change |

Core use-cases may add business annotations via the `@opentelemetry/api`
facade (allowlisted vocabulary); they never import an SDK, exporter or vendor
package.

**What is wired today.** The table above describes the seams; the trace *id* is
only as end-to-end as the registered providers, and today none are on the
browser. `apps/web` installs the Sentry browser SDK but **no OTel browser
provider**, so `core/client`'s `traceparent` injection reads the no-op facade
and emits nothing — the SPA does not yet originate a trace id, and the
error-fallback trace id appears only once a browser provider is registered. Hono
continues an incoming `traceparent`, but there is **no DB-hop instrumentation**,
and the **tail-sampling policy is documented intent, not implemented code**.
Which providers/samplers to register (and the web `tracesSampleRate` vs the
happy-path tail-sampling policy above) is the open wiring decision — DECIDE, not
shipped.

## Sinks

- **Default: Sentry** (errors + distributed traces + endpoint timings + web
  vitals), fed via its OTel integration. Enough for launch on both targets.
- **Analytics-grade wide events**: when log-analytics needs outgrow Sentry
  (querying events like a database), the named alternative is a columnar
  store — Axiom (free tier: 500 GB/mo ingest, 30-day retention, mid-2026) or
  self-hosted ClickHouse on the Docker target. Because instrumentation is
  OTel, adding/switching sinks is exporter config in the composition root.
- **Metrics and dashboards are views over wide events** — no separate metrics
  system until a proven need; the logs-vs-metrics split is artificial when
  events carry full context.

## Enforcement

- `no-console` errors in `apps/web` **and** `apps/server` — the wide event is
  the log (scoped exception wired for the composition root's startup/fatal
  path: `apps/server/src/entry.*.ts` and `env.ts`).
- Review rule (Phase 4 candidate once patterns settle): request handlers and
  use-cases annotate spans, they do not emit events — emission belongs to the
  middleware, exactly once.
- Platform note: on Vercel the OTel SDK must flush before the invocation
  freezes (use the platform's OTel support / `waitUntil`); on Docker the SDK
  runs normally. Same facade calls everywhere.
