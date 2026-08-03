# ADR-0012: Per-origin CLI profiles — client state scoped like browser cookies

Date: 2026-07-27 · Status: accepted (owner-approved) · Builds on
[ADR-0004](0004-no-exceptions-enforcement.md) (a promise in prose maps to an
enforcer — the prose warning this decision replaces is the weakest tier there is)
and [ADR-0003](0003-vercel-environments.md) (there is more than one deployment to
point a client at, and there always will be).

## Context

**The CLI keeps one profile per machine, and a fresh-clone retest proved that is
a correctness bug, not an inconvenience.**
`demo/apps/cli/src/config.ts` resolves a single file — `~/.config/agentproofarch/config.json`,
built from `homedir()` — holding exactly three keys:

```ts
const cliConfigSchema = z.object({
  apiUrl: z.string().default('http://localhost:47100'),
  token: z.string().nullable().default(null),
  tenant: z.string().nullable().default(null),
});
```

That file is keyed off the home directory and nothing else, so it survives
clones, worktrees, branches **and** deployments. Every session write pins the
one `apiUrl`: `login` and `register` call
`saveConfig({ ...config, apiUrl: ctx.apiUrl, token })`, the CLI auth adapter's
`onToken` callback in `cliCtx` does the same, `login-link --link` repeats it, and
`tenant switch` overwrites the one `tenant`. So a single
`cli --api-url https://<deployment> login` rewrites the machine's only profile.

The failure that motivated this ADR is what happens *next*, in a different
directory, days later. The quickstart's hello block carries no `--api-url`:

```bash
pnpm --silent run cli --json health
pnpm --silent run cli login --email demo@agentproofarch.dev --password demo-agentproof-1234
pnpm --silent run cli tenant switch acme
pnpm --silent run cli todo list
```

On a machine that had ever pointed the CLI elsewhere, that block talked to the
**previously configured deployment** while the reader believed they were reading
their own `dev:server` on 47100. Nothing in the output says otherwise: `health`
returns a perfectly good `{ ok: true, status: "ok", database: "up" }` — from the
wrong instance. It is not confined to reads either; `todo add` in the same block
writes a row into whatever instance the stale profile names.

The mitigation shipped so far ([#84](https://github.com/chomamateusz/agentproofarch/pull/84))
is a paragraph of prose: a warning block in the quickstart telling the reader to
run the whole thing under `export HOME="$(mktemp -d)"` or to repeat `--api-url`
on every line, including the `health` line that runs before `login`. That is a
REVIEW-tier guarantee against a silent data-destination bug, and it asks a
first-time reader to perform an unrelated ritual before their first successful
command. The architecture's own doctrine — a promise in prose must map to a
mechanism — says the shape of the state is what should change.

**The shape is the actual defect.** One machine-global slot for *client session
state* is the wrong model for a client that legitimately talks to many
instances: a laptop routinely faces localhost, a preview URL, staging and
production, and the repo's own harnesses already talk to at least two
(`pnpm run smoke` boots a throwaway port, `pnpm run smoke:remote` drives
`BASE_URL`). Every other client of a multi-instance HTTP API solved this by
scoping state to the instance: browsers key cookies by origin, `kubectl` keys
credentials by context, cloud CLIs key them by account. Ours keys them by
`$HOME`.

## Decision

1. **The browser model: CLI client state becomes per-origin.** The config file
   keeps its XDG location (`~/.config/agentproofarch/config.json`, mode `0600`)
   and changes shape: a map of profiles keyed by **API-URL origin**, plus a
   pointer at the current one.

   ```json
   {
     "version": 2,
     "currentOrigin": "http://localhost:47100",
     "profiles": {
       "http://localhost:47100": { "token": "…", "tenant": "acme" },
       "https://agentproofarch.vercel.app": { "token": "…", "tenant": null }
     }
   }
   ```

   The key is the WHATWG origin of the resolved API URL (`new URL(apiUrl).origin`
   — scheme + host + port, lower-cased, default port elided), so it is
   canonical rather than a string the user typed. **Pointing the CLI at another
   instance switches context; it never clobbers another origin's session.**
   Logging in to production and then running the quickstart against localhost
   leaves both sessions intact and usable, exactly as two tabs in a browser
   carry two cookie jars, and as two `kubectl` contexts carry two credentials.

   The minimum surface this model implies — mirroring the `tenant list` /
   `tenant switch` pair the CLI already has — is `origin list` (configured
   origins, the current one marked, token present/absent; **never** the token
   itself) and `origin use <url>` (move `currentOrigin`, no network call). Switching
   back to a deployment you are already signed in to must not require signing in
   again.

2. **Env overrides for agents and CI: `APP_CLI_API_URL` and `APP_CLI_TENANT`.**
   The names follow the server schema's plain style in
   `demo/core/server/config.ts` (`APP_BASE_DOMAIN`, `APP_BASE_URL`,
   `APP_COMMIT_SHA`): the `APP_` family, SCREAMING_SNAKE, no vendor prefix. The
   `CLI` infix marks them as *client-side*: they are **not** part of
   `serverEnvSchema` and must not appear in `.env.example`; their schema home is
   `apps/cli/src/config.ts`, parsed with zod like every other boundary.

   **The token stays file-only — there is deliberately no `APP_CLI_TOKEN`.**
   Three reasons, in order of weight:
   - A session token is *written* by the CLI, not supplied to it. `login`,
     `register` and `login-link --link` each receive a token from the server and
     persist it; `logout` revokes it server-side and clears it. An env-supplied
     token has no writer and no revoker — `logout` could not clear it, and the
     CLI could not persist a re-issued one.
   - Env vars leak. They are inherited by every child process, printed by
     `set -x`, dumped by "print the environment" debug steps, captured by CI job
     logs and by crash reporters. The file is a single-purpose `0600` file that
     no unrelated process reads. Handing agents a documented way to put a live
     bearer token on a command line is the one affordance in this design that
     would reliably end up in a public CI log.

   **Update (2026-07-28):** `logout` attempts server-side revocation and clears
   the active origin's local token even when that attempt fails.

   - CI does not need it. The repo's own harnesses already show the pattern:
     `demo/scripts/smoke-cli.ts` gives each persona a throwaway `HOME` and calls
     `login` with credentials from the environment. Credentials belong in the
     secret store; the token belongs in the file the login wrote it to.

3. **Repo-detection default: inside this checkout, the default is the dev
   server.** When the CLI runs inside a checkout of this repository and no origin
   was given for the session (no flag, no env), the default API URL is the dev
   default derived from the same values `core/server/config.ts` documents —
   `http://localhost:` + the `PORT` field's default (47100). The constant moves
   to `core/contract` (which both `core/server` and `apps/cli` may import, unlike
   `core/server`, which clients may never import) so the server's default port
   and the CLI's default URL cannot drift apart.

   **Detection mechanism, exactly:** walk up from `process.cwd()` to the
   filesystem root; in each directory attempt to read `package.json` and
   zod-parse `{ name: string }` from it, ignoring a missing or unparseable file;
   the checkout is detected when a `name` of `agentproofarch` is found (that is
   `demo/package.json`, the workspace root, and the CLI always runs from inside
   it). It costs a handful of failed `readFileSync` calls, spawns nothing, and —
   because the marker is a *file's content*, not a path — it survives renamed
   clones, worktrees, and copies made without `.git` (all three exist in this
   repo's own tooling; `demo/scripts/quickstart-probe.ts` copies the checkout
   into a differently named directory on purpose).

   **Precedence, normative:**

   ```
   --api-url flag  >  APP_CLI_API_URL  >  repo-detection default  >  configured currentOrigin
   --tenant flag   >  APP_CLI_TENANT   >  the selected profile's tenant
   ```

   The `token` has no ladder: it always comes from the profile of the resolved
   origin. Tenant has no repo-detection rung — there is no such thing as a
   "this checkout" tenant.

   **Repo-detection deliberately outranks the stored `currentOrigin`, and that is
   the surprising rung.** It is what makes a fresh clone's hello block always
   talk to localhost, whatever the machine did before, which is precisely the
   retest failure. The cost is that targeting a deployment *from inside the
   checkout* requires saying so (`--api-url` or `APP_CLI_API_URL`). That trade is
   accepted: typing a flag when you deliberately aim at production is a visible
   inconvenience, and silently writing a todo into production because a config
   file remembered something is an invisible one.

4. **`currentOrigin` moves only on an explicit act.** A flag- or env-resolved
   invocation that writes the config (`login`, `register`, `login-link --link`,
   `logout`, `tenant switch`) sets `currentOrigin` to that origin — pointing the
   CLI somewhere and signing in *is* the switch — as does `origin use`.
   Repo-detection never writes it: it is a per-invocation default scoped to the
   checkout, not a selection, so running the quickstart never re-aims the CLI for
   the rest of the machine. Read-only commands never write the config file at all
   (the one-time migration below excepted).

5. **Migration is automatic, lossless and quiet.** On first run against a legacy
   file (top-level `apiUrl`/`token`/`tenant`, no `profiles`), the CLI rewrites it
   into the origin-keyed shape: the legacy `apiUrl` becomes the profile key
   **and** `currentOrigin`; `token` and `tenant` become that profile's fields; no
   field is dropped. A legacy file with an absent or unparseable `apiUrl` keys
   under the dev default, matching today's schema default. No user action, no
   prompt, no re-login.

   The rewrite is atomic: write a sibling temp file created with mode `0600`
   (not `writeFileSync` + `chmodSync`, which leaves the token world-readable for
   an instant — today's code has that window), then `renameSync` over
   `config.json`, which is atomic within a directory on POSIX. A crash therefore
   leaves either the old file or the new one, never a truncated one. No `.bak`
   copy is kept: a second `0600` file holding a live bearer token is a wider
   blast radius than the rewrite it would protect against.

   Exactly one line goes to **stderr**, never stdout — `--json` must keep
   emitting exactly one document on stdout, which is a hard property of this CLI:

   ```
   agentproofarch: migrated ~/.config/agentproofarch/config.json to per-origin profiles (http://localhost:47100)
   ```

   A file whose shape matches neither version is never silently reset. The one
   quiet case is forward compatibility: a shape that announces a *newer* format
   — a top-level `version` other than `2`, or a `profiles` key with no
   `version` at all — is read as "no profiles" and left byte-for-byte intact,
   so a future format is never destroyed by a read. **Everything else fails
   loud.** Malformed JSON, a corrupted version-2 profile, a corrupted legacy
   field: each aborts the invocation with a clear error naming the file
   (`internal`, exit 10 — under `--json` still exactly one envelope on stdout),
   and the CLI never rewrites the file it could not read. A corrupted `0600`
   file holding a live bearer token is evidence that something on this machine
   went wrong; a silent reset would destroy the sessions *and* the evidence.
   `config.test.ts` asserts both halves: every loud failure leaves the file
   byte-for-byte unchanged, and the future-version read rewrites nothing.

6. **Explicitly rejected, with reasons.**

   | Rejected | Why |
   |---|---|
   | **Keep one global profile and harden the docs** | It is what shipped in [#84](https://github.com/chomamateusz/agentproofarch/pull/84) and it is a REVIEW-tier guarantee over a silent wrong-instance write. It also charges every new reader an `export HOME="$(mktemp -d)"` ritual before their first command. |
   | **A per-directory config (`.agentproofarchrc` in the checkout)** | Puts a bearer token inside a working tree, one `git add -A` away from a public repo, and needs gitignore discipline in every consuming app. The browser model keeps credentials in one `0600` store outside any tree. |
   | **User-named profiles + `--profile <name>` (the AWS model)** | Requires inventing and remembering a name, and a second mapping (name → URL) that can drift from reality. The origin already *is* the identity of a deployment and is derivable from `--api-url` with no naming ceremony. Named contexts are `kubectl`'s ergonomics, not its mechanism; the mechanism is per-context credentials, and that is what graduates. |
   | **Environment-name profiles (`dev`/`staging`/`prod`)** | Same defect one level up: a label that can point anywhere, re-pointed by whoever edited it last. The origin is ground truth. |
   | **`APP_CLI_TOKEN` for CI** | Decision 2. |
   | **Detecting the checkout with `git rev-parse --show-toplevel`** | Spawns a subprocess on every invocation, answers "*some* git repo" rather than "this one", and fails on a copy made without `.git` — which this repo's own quickstart probe creates. |
   | **Detecting the checkout by directory name** | Breaks on every renamed clone and on every worktree, both of which are routine here. |
   | **Keying profiles by full base URL rather than origin** | Two spellings of the same instance (trailing slash, upper-case host, explicit `:443`) would become two profiles with two half-sessions. Canonicalising to the origin makes the key a fact about the server, not about the string the user typed. |

## Consequences

- **The quickstart's global-profile warning shrinks dramatically.** The
  `export HOME="$(mktemp -d)"` step, the "pin the URL with `--api-url`" fallback
  and the "add the same flag to the `health` line" footnote all become
  unnecessary: inside the checkout the hello block talks to localhost by
  construction. What remains is one sentence — the CLI keeps a session per API
  origin, and inside this repo the default origin is your dev server. **A
  docs-readability variant of the quickstart is in flight**: this change updates
  only that minimal factual truth in the current docs, and the fuller narrative
  (the cookie-jar analogy, the worked multi-instance story) lands with whichever
  variant the owner picks, so the two efforts do not rewrite the same paragraphs
  twice.
- **The CLI walkthrough gains a context-switch example** and a corrected config
  sample. Its "stored config" section currently prints the three-key legacy
  JSON; it gets the origin-keyed shape, the precedence ladder, the two env
  names, and a worked local → deployed → local switch.
- **No server changes, one deliberate layer-rule relaxation.** No route, no
  contract change, no addition to `serverEnvSchema` and none to `.env.example`.
  The default-dev-port constant moves into `core/contract`, and reading it from
  `core/server/config.ts` requires relaxing the layer rules docs-first: both
  enforcers (`core-server-pure` in `.dependency-cruiser.cjs` and the ESLint
  boundaries matrix) now allow `core/server` → `core/contract`, with
  `docs/architecture.md` §Layers and the PRD's dependency list updated in the
  same change. `apps/cli` itself still imports `core/client` + `core/contract`
  only.
- **Existing CI, smoke and e2e keep working — checked, not assumed.**
  `demo/scripts/smoke-cli.ts` passes `--api-url <baseUrl>` on **every**
  invocation and runs each persona under its own `mkdtemp` `HOME`;
  `demo/scripts/quickstart-probe.ts` does the same;
  `demo/scripts/smoke-remote.ts` reuses that driver with `BASE_URL`. The flag is
  the top rung of the new ladder and each temp `HOME` starts with no config
  file, so every one of those runs resolves the same origin it does today, with
  its token now written under that origin's key. The Playwright suites
  (`demo/e2e/`, `demo/visual/`) drive a browser against the server and never read
  the CLI config at all.
- **`apps/cli/src/config.test.ts` grows the load-bearing cases**: legacy →
  origin-keyed migration (including the absent-`apiUrl` legacy file), two origins
  not clobbering each other, the four-rung URL ladder and the three-rung tenant
  ladder, and the stderr-only migration notice. The coverage ratchet moves up
  with them.
- **Enforcement, honestly tiered.**

  | Rule | TYPE | LINT | TEST | REVIEW+AI |
  |---|---|---|---|---|
  | Config is an origin-keyed map | the zod schema — a legacy shape does not parse as a profile map | n/a | migration + isolation cases | — |
  | Precedence ladder | n/a | n/a | unit tests over the resolver, one per rung | ordering intent |
  | Token never from env | the parsed CLI env object has no token field, so reading one does not typecheck | n/a | — | that no future command re-introduces it |
  | Migration is atomic and stdout-clean | n/a | n/a | temp-file + rename asserted; `--json` still yields one document | — |

- **Three residuals stay open and named.** (a) Keying by origin discards a path
  in the base URL, so an API mounted under a path is honoured for the
  invocation but keyed by its host — and a stored `currentOrigin` is an origin,
  so such a deployment must be passed by flag or env each time. (b) Concurrent
  CLI invocations writing the file are last-writer-wins; there is no lock,
  because the CLI is not a concurrent program in practice. (c) The file remains
  a plaintext `0600` bearer-token store — no OS keychain — which is unchanged
  from today and out of scope here.
