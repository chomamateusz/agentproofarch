# agentproofarch

An agent-first, strictly layered full-stack TypeScript architecture for
multi-tenant SaaS — and a working reference implementation of it.

The idea in one paragraph: a pure-TypeScript core (domain, API contract,
use-cases + ports, typed client) surrounded by thin adapters (database, auth,
domain provisioning) and thin apps (HTTP server, web SPA, CLI). Every layer
boundary is machine-enforced by lint, every capability is verifiable from the
CLI with JSON output and deterministic exit codes — so AI agents can build,
run and verify features in a closed loop, and the same commit deploys to
Vercel or a self-hosted Docker stack.

## Repository layout

| Folder | Contents |
|---|---|
| [`docs/`](docs/) | The architecture ([architecture.md](docs/architecture.md)) and the PRD ([prd-agentproofarch-foundation.md](docs/prd-agentproofarch-foundation.md)) it was distilled into |
| [`demo/`](demo/) | The walking skeleton: multi-tenant todos with auth, organizations, tenant subdomains, web UI (themed Material UI), full CLI and enforced boundaries |

## Quick tour

```bash
cd demo
npm install
npm run db:up && npm run db:migrate && npm run db:seed
npm run build:web
npm run dev:server        # http://acme.localhost:47100 + http://globex.localhost:47100
```

Sign in as `demo@agentproofarch.dev` / `demo1234`, or drive everything from
the CLI — see [`demo/README.md`](demo/README.md) for the full walkthrough.
