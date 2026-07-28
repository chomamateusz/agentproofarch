---
title: Troubleshooting first run
sidebar_label: 🚨 Troubleshooting first run
description: The longer tail of first-boot failures — old checkouts, shared Docker stacks, stale volumes, origin mismatches.
---

# Troubleshooting first run 🚨 \{#troubleshooting-first-run}

*Read this when the [Quickstart](./quickstart.md) hit something its own short table does not cover.*

The five most common first-boot failures live in the
[Quickstart's own table](./quickstart.md#troubleshooting); this page carries the
longer tail — rarer failures, and the archaeology of an older checkout.

## The longer tail 🗃️ \{#the-longer-tail}

| Symptom | Cause | Fix |
|---|---|---|
| `check` fails in `lock-lint` after adding a dependency | `package.json` and `pnpm-lock.yaml` are out of sync | run `pnpm install` with the pinned package manager and commit the settled lockfile |
| Sign-in returns 403 "invalid origin" | Better Auth requires the request `Origin` to match `APP_BASE_URL`; changing the port without changing `APP_BASE_URL` breaks it | keep `APP_PORT` and `APP_BASE_URL` in step |
| A second clone attaches to the first clone's database and Mailpit | `docker-compose.dev.yml` deliberately names one shared machine-wide stack, `agentproofarch-dev` | this is the default design; for per-clone isolation set a unique `COMPOSE_PROJECT_NAME` and non-conflicting `DB_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_API_PORT`, and matching `DATABASE_URL` |
| `pnpm run db:up` refuses to start (or Docker reports port 47542 already allocated), and `docker ps` shows a `demo-db-1` container | your checkout predates the `agentproofarch-dev` project name, so Docker still runs the old directory-derived project `demo`, which owns port 47542 and the volume `demo_agentproofarch-pgdata`; the renamed stack cannot start next to it | retire the **old** project by name: `docker compose -p demo down -v` — **this deletes the old dev volume; its seed data is disposable** — then `pnpm run db:up && pnpm run db:migrate && pnpm run db:seed` |
| Your dev database holds duplicated seed rows (four Acme todos, say) | the volume predates the idempotent seed and accumulated a set per `db:seed` run | reset the **current** `agentproofarch-dev` stack from `demo/` with `docker compose -f docker-compose.dev.yml down -v` — **this deletes the dev database volume** — then `pnpm run db:up && pnpm run db:migrate && pnpm run db:seed` |
| e2e fails at startup with the port already in use | a previous harness left the port bound | the harness now frees the port before boot ([#55](https://github.com/chomamateusz/agentproofarch/pull/55)); if it recurs, that is a P1 to file, not a job to rerun |
| Every CLI command fails with `error(internal): agentproofarch: invalid ~/.config/agentproofarch/config.json…` | the per-origin config file is corrupted — malformed JSON, or a `version: 2` document with a broken shape; the CLI fails loud rather than silently resetting stored sessions, and under `--json` the failure is still exactly one JSON envelope (exit 10) | fix or delete `~/.config/agentproofarch/config.json`; a legacy single-profile file is *not* this case — it migrates itself losslessly on first run |

## Ports, for reference 🔌 \{#ports}

Nothing binds a common port, on purpose — 3000, 5432, 8080 and friends are all
avoided so the stack never collides with whatever else you are running.

| Port | Service |
|---|---|
| 47100 | API + built SPA (`dev:server`; the `PORT` default) |
| 47180 | Vite dev server (`dev:web`) |
| 47542 | Postgres 16 (`docker-compose.dev.yml`; override with `DB_PORT`) |
| 47925 | Mailpit SMTP (override with `MAILPIT_SMTP_PORT`) |
| 47980 | Mailpit web UI + HTTP API (override with `MAILPIT_API_PORT`) |
| 47101 | Self-host only: the internal domain-check control plane (`INTERNAL_PORT`, unset in dev) |

## Where next ➡️ \{#where-next}

- [Quickstart](./quickstart.md) — back to the happy path.
- [CLI walkthrough](../guides/cli-walkthrough.md) — verify what you booted.
- [Environments & promotion](../operations/environments.md) — how the same commit deploys.
