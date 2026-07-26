---
title: ADR-0009 — Package manager — npm → pnpm
sidebar_label: '0009 · Package manager: pnpm 📦'
description: Supply-chain hardening at install time — dependency scripts off by default, a release-age cooldown, a strict non-hoisted layout, and frozen-lockfile everywhere.
---

# ADR-0009 — Package manager: npm → pnpm, for supply-chain hardening 📦 \{#adr-0009--package-manager-npm--pnpm-for-supply-chain-hardening}

**2026-07-26 · accepted (owner decision).** Builds on [ADR-0004](./0004-no-exceptions-enforcement.md) (gates are enforcement, not convention — `lock-lint` is one of `check`'s members) and `architecture.md` §Security, "Dependency hygiene". → [full ADR on GitHub](https://github.com/chomamateusz/agentproofarch/blob/main/docs/decisions/0009-package-manager-pnpm.md)

## Summary 📋 \{#summary}

pnpm replaces npm for every npm project in the tree — `demo/` and `website/` together. Dependency lifecycle scripts are **off by default** with a minimal, reviewed `onlyBuiltDependencies` allowlist; a **minimum-release-age cooldown** declines freshly published versions; the **strict, non-hoisted layout** makes the module resolver enforce declared dependencies; and every install path — `check`'s `lock-lint`, CI, Docker, Vercel — enforces the same **frozen-lockfile** semantics.

## The WHY 🤔 \{#the-why}

The previous posture — committed `package-lock.json`, `npm ci` everywhere, `lock-lint` in the static gate, advisory `npm audit` — assumed the registry hands back what its maintainers intended. 2025 broke that assumption twice, in *different* ways:

- the **Shai-Hulud worm** propagated through dependency `postinstall` scripts: attacker code executed at **install time**, before anything imported a single line of the package;
- the **`chalk`/`debug` maintainer-account compromise** shipped its payload **inside runtime code** — an install-time defence would not have touched it.

Those two set the honest boundary of this decision: a package manager that does not execute dependency scripts removes the *first* vector and does **nothing** about the second. **This ADR buys the install window, not immunity.**

npm's own answer, `--ignore-scripts`, is all-or-nothing and per-call-site — exactly the honour-system control [ADR-0004](./0004-no-exceptions-enforcement.md) exists to reject. pnpm ≥10 inverted the default instead: nothing in the dependency tree runs unless it is named.

## Decided ⚖️ \{#decided}

### 1. pnpm for every npm project, pinned by `packageManager` 📌 \{#1-pnpm-for-every-npm-project-pinned-by-packagemanager}

`demo/` (the foundation) and `website/` (Docusaurus) move together — keeping one on npm would leave two lockfile formats, two install semantics and two hardening stories in the same CI matrix. The toolchain is pinned exactly as the npm 11 pin was: `"packageManager": "pnpm@<exact.version>"`, activated through Corepack, `engines` updated to match. The pin is what makes a local install and a CI install the same install.

### 2. Dependency lifecycle scripts stay off; exceptions are an explicit allowlist 🚫 \{#2-dependency-lifecycle-scripts-stay-off-exceptions-are-an-explicit-allowlist}

pnpm ≥10 does not run dependencies' `preinstall`/`install`/`postinstall` by default (the *project's own* scripts are unaffected). Packages that genuinely need a build step are named in **`onlyBuiltDependencies`** — a security control, not configuration convenience:

- the list stays **minimal** — a package earns a place only by breaking a gate without one, never pre-emptively;
- every addition is reviewed on its own merits in the PR that adds it, with the failure it fixes stated;
- the shipped list is whatever a green `check` / `smoke` / `e2e` / `docker-smoke` proves necessary — no more.

### 3. A minimum-release-age cooldown is on ⏳ \{#3-a-minimum-release-age-cooldown-is-on}

Freshly published versions are not installable until they age past `minimumReleaseAge` — measured in days, not minutes. Both 2025 incidents were detected and cleaned within hours to days, so an install that simply declines to be first closes most of the compromised-release window. **The override procedure is explicit**: an urgent patch younger than the cooldown is taken by lowering the setting **in a reviewed pull request** — never a local flag, never silently — with the lowering and its revert both in the diff.

### 4. The strict, non-hoisted layout is the point — no escape hatches 🧱 \{#4-the-strict-non-hoisted-layout-is-the-point--no-escape-hatches}

`shamefully-hoist` and a hoisted `node-linker` are off. Phantom dependencies — imports that resolve today purely because npm hoisted a transitive package into the flat tree — stop resolving; the fix is to declare the dependency, not to flatten the tree back. This repo already attacks that class from the outside with knip and dependency-cruiser; pnpm makes the module resolver enforce it — the same move ADR-0004 makes everywhere else (structure over discipline).

### 5. `lock-lint` is re-targeted, not retired 🔒 \{#5-lock-lint-is-re-targeted-not-retired}

It stops validating `package-lock.json` and starts proving that `pnpm-lock.yaml` and `package.json` agree under **frozen-lockfile** semantics — the same thing every install path now enforces: a lockfile that would have to change fails the gate rather than being quietly rewritten. `pnpm-lock.yaml` is committed; `package-lock.json` is deleted.

### 6. Every install path changes together 🔁 \{#6-every-install-path-changes-together}

The CI workflows install with a frozen lockfile and cache the pnpm store; the `Dockerfile`'s builder and `prod-deps` stages install with pnpm (the production prune becomes a `--prod` install); Vercel builds through the `packageManager` pin. Any GitHub Action added for pnpm setup is pinned by full commit SHA like every other `uses:` ([ADR-0004](./0004-no-exceptions-enforcement.md) §5, [CI gates](../operations/ci-gates.md)).

### 7. Vercel compatibility is proven, not assumed ✅ \{#7-vercel-compatibility-is-proven-not-assumed}

The claim "Vercel builds this repo with pnpm" is settled by the migration PR's own preview deployment going green and by `post-deploy-smoke` driving it — the same standard the platform contract has been held to since PRs #10–#15. If the preview does not deploy and smoke, the migration does not land.

## Alternatives considered 🔀 \{#alternatives-considered}

| Alternative | Verdict | Why |
|---|---|---|
| **Stay on npm, pass `--ignore-scripts` everywhere** | rejected | All-or-nothing (packages that need a build step break, so the flag comes straight back off) and per-call-site — the moment one workflow, Dockerfile stage or developer omits it, the vector is open again with nothing red to show for it. Buys none of the other three properties: no cooldown, no phantom-dependency elimination, no shared store. |
| **Yarn Berry / PnP** | rejected | Strictest resolution of the three, but PnP changes module resolution itself — a compatibility surface across Vite, Vitest, Playwright, tsx, drizzle-kit and the Vercel builder. A much larger blast radius for the same install-time guarantee pnpm gives with a conventional (if linked) `node_modules`. |
| **Bun** | rejected here | A runtime swap dressed as a package-manager swap: the repo pins Node 24 across `.nvmrc`, `engines`, the Docker base image and the Vercel runtime, and the gates' value comes from every environment running the same runtime. Adopting Bun is its own ADR, not a footnote to this one. |

## Consequences ⚡ \{#consequences}

- **The `lock-lint` member of `check` changes shape**: its subject is `pnpm-lock.yaml`, its semantics frozen-lockfile. A stale lockfile now fails the same way in `check`, CI, Docker and Vercel — one rule, four places, instead of npm's "reinstall and see".
- **The npm-10-vs-11 pin story is obsolete.** The `packageManager` pin is now the whole story; the Node pin (`.nvmrc`, `engines.node`) stands independently of it.
- **Corepack becomes load-bearing** for activating the pinned pnpm. It ships with Node 24; if a future Node line unbundles it, the fallback is installing the pinned pnpm explicitly in CI and Docker — the `packageManager` field stays the single source of the version either way.
- **Every documented command example changes** (`npm run check` → the pnpm equivalent) across the READMEs, `docs/`, `website/docs`, the `CLAUDE.md` files and the scaffolder output — doc-lint and the tests that assert on that output verbatim are what stop the sweep from being partial.
- **Phantom-dependency breakage surfaces at migration time, not later.** The migration found exactly one: `observability.ts` imports `@opentelemetry/sdk-trace-base`, which the Docker runtime image resolved only through npm hoisting — under the strict `--prod` tree the image failed to boot, and the fix was declaring it as the production dependency it always was.
- **The Docker image's `node_modules` becomes a linked tree** (a virtual store plus symlinks); the multi-stage build copies the directory as a whole, and the `docker-smoke` required check is what proves the runtime image still boots.

:::caution[Honest caveats]
- **A compromised package whose payload lives in runtime code still executes when the application imports it.** The cooldown narrows the window in which such a version is installable at all, and `pnpm audit`'s advisory role is unchanged, but neither is a runtime defence. This decision hardens **installation**.
- **The cooldown delays urgent security patches too** — the same setting that stops a worm's first six hours also stops the fix for a critical advisory published this morning. The reviewed-PR override is the accepted procedure, deliberately as visible as the risk it takes on.
- **The allowlist is a standing review obligation.** `onlyBuiltDependencies` is the one place where the default protection is switched off by name; a list that grows by reflex turns the guarantee back into npm's.
:::
