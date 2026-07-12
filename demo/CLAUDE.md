# agentproofarch — rules for agents

Architecture spec: `../docs/prd-agentproofarch-foundation.md` (see also `../docs/architecture.md`) (§3 is normative).

## The two gates

- `npm run check` = typecheck + ESLint (boundaries) + dependency-cruiser +
  vitest — the **static** gate.
- `npm run smoke` = the **runtime** gate: it verifies the installed dependency
  tree matches `package-lock.json`, drops+recreates an isolated
  `agentproofarch_smoke` database (never touches your dev-seeded data), migrates
  and seeds it, boots the real server (`entry.node.ts`) on an ephemeral port and
  drives health → sign-in → todos through the CLI, asserting taxonomy exit codes
  (including unauthorized = exit 3). Assumes `npm run db:up`. Runs in ~5s.

**Done = `check` green AND `smoke` green.** Static-green is not done; the app
must actually run. Do not weaken lint rules to make either green.

## Layer rules (enforced, but know them anyway)

- `core/**` is pure TypeScript: no hono, react, drizzle, better-auth, pg, commander.
- `core/domain` depends on zod only. `core/server` = use-cases + ports.
  `core/contract` = the only bridge between server and clients.
  `core/client` = the only way any client talks HTTP.
- `adapters/**` implement ports; only `apps/server/src/composition.ts` instantiates them.
- `apps/web` and `apps/cli` import `core/client` (+ auth client adapter), never
  `core/server`, never `adapters/db`.
- `@vercel/*` / `@neondatabase/*` only inside `adapters/` (and `entry.vercel.ts`).
- No `any`. No `as` (except `as const`). Parse with zod at every boundary.
- Use-cases return `Result<T, AppError>`; never throw across a boundary.
  New error kinds go into `ERROR_CODES` in `core/domain/errors.ts` and get an
  HTTP status + exit code mapping in `core/contract/http-status.ts` (exhaustive).
- Every tenant-scoped use-case takes `ctx: { identity }` first; every
  tenant-scoped repository method requires `tenantId`.

## Verify features through the CLI first

```bash
npm run db:up && npm run db:migrate && npm run db:seed
npm run dev:server &          # port 47100
npm run --silent cli -- --json health
npm run --silent cli -- login --email demo@agentproofarch.dev --password demo1234
npm run --silent cli -- --tenant acme todo list
```

`--json` prints exactly one JSON envelope on stdout; exit codes come from
`EXIT_CODE_BY_ERROR_CODE`. Adding a resource = domain schema → contract route →
port + use-case → adapter repo → server route → `core/client` method →
CLI command → web page, in that order, with tests at the core layer.

## Dev notes

- Ports: API 47100, Vite dev 47180, Postgres 47542 (never 3000/8080/5432).
- Tenants live on subdomains: `acme.localhost:47100`. Browsers reject
  `Domain=.localhost` cookies → per-subdomain login in dev only.
- Better Auth CSRF requires an `Origin` header on auth POSTs (CLI sends its API URL).
- Seed is idempotent; demo credentials `demo@agentproofarch.dev` / `demo1234`.
