---
title: ADR-0011 — The layout layer (page skeletons)
sidebar_label: '🧱 0011 · The layout layer'
description: Page skeletons become a named structural element with two import rules, a split app shell, and a structural sx tier that waits for a named trigger.
---

# ADR-0011 — The layout layer: page skeletons as a named, enforced structural element 🧱 \{#adr-0011--the-layout-layer-page-skeletons-as-a-named-enforced-structural-element}

**2026-07-27 · accepted (owner-approved).** Builds on [ADR-0005](./0005-client-application-state.md) (features are islands), [ADR-0004](./0004-no-exceptions-enforcement.md) (a promise in prose maps to an enforcer) and [ADR-0008](./0008-visual-regression.md) (the visual harness this decision reuses rather than duplicates). → [full ADR on GitHub](https://github.com/chomamateusz/agentproofarch/blob/main/docs/decisions/0011-layout-layer.md)

## Summary 📋 \{#summary}

`components/layout/` becomes a named structural element of `apps/web`: the one legal home for a component that owns a page's shape. Two import rules govern it, the app shell splits into a stateless skeleton plus a thin stateful composition, and each skeleton carries visual specs on the existing ADR-0008 harness. What graduates from the app this pattern came from is the **category and the rules** — not its component catalog and not its screenshot stack.

## The WHY 🤔 \{#the-why}

**A stateful page shell had no legal home.** The frontend structure diagram named `main.tsx`, `api.ts`, `routes/`, `features/`, `components/ui/`, `lib/` and `theme.ts` — no category for "the skeleton of a page" — and the route-tree prose actively *sanctioned* the shell living as "a feature under `features/settings/`".

That placement fails in three ways:

1. **It is not a settings concern.** The shell is the chrome of the whole authenticated app: the auth guard, the tenant switcher, logout, the primary navigation, the `Outlet`.
2. **It was unrepresentable anywhere else.** Features are islands, so no other feature may consume it; it passes the gate only because its one importer is `main.tsx`, which is not a feature. The obvious alternative is closed too — `web-ui-is-presentational` bans TanStack from `components/ui/`, and the shell runs `useQuery`/`useMutation`. Not discouraged: **unrepresentable**.
3. **The symptom was already in the code.** The shell hand-repeated `<Container sx={{ maxWidth: '44rem' }}>` on two non-happy branches, and the onboarding screen hand-rolled a centred-card skeleton (a `display: grid; placeItems: center` box around a `26rem` paper) — two page skeletons written inline in one file, because nothing could name them once.

**The evidence it generalises comes from a second app on this architecture** that completed a full layout migration and runs it under enforcement: a `components/layout/` directory of skeletons, a dependency rule keeping it free of feature data and api, the visual-key `sx` rule with a shrink-only baseline, and committed screenshots per skeleton and state. The load-bearing result: its layout survived **seven themes** unchanged, because the skeletons hold structure only and take every colour, font and border from `theme.ts` atoms.

Half the mechanism was already here — `agentproofarch/sx-layout-only` graduated earlier and is part of the portable artifact. What was missing is the **layer that rule was written to protect**.

:::caution[The honest provenance note]
That app's own task document claims a "structural tier" and a `no-restricted-imports` ban on skeleton MUI components scoped to its layout directory. **Neither exists in its configuration.** Three of four mechanisms shipped (the visual `sx` tier, the dependency rule, the screenshot harness); the structural tier is a design that has never run against a real codebase anywhere. That is exactly why it lands here as WHEN TRIGGERED rather than NOW.
:::

## Decided ⚖️ \{#decided}

### 1. `components/layout/` is a structural element 🧱 \{#1-componentslayout-is-a-structural-element}

Three properties define the layer, and they travel together:

- **Structure only** — grid, flex, spacing, sizing, position live here; colour, typography, background and border come from `theme.ts` atoms. This is what makes a skeleton theme-proof.
- **Content arrives through slots** — callers pass `ReactNode` (`header`, `action`, `rail`, `children`); a skeleton never fetches, never names a domain type, never reads a route param.
- **Non-happy branches render *inside* the skeleton** — loading, error, empty and not-found are states *of* the page, not replacements for it, so width never jumps between a pending render and a loaded one. That jump is precisely the defect visible in today's shell.

### 2. Two import rules, one of them honestly weaker 🚧 \{#2-two-import-rules-one-of-them-honestly-weaker}

| Rule | Mechanism | Tier |
|---|---|---|
| **(a) Layouts are structure only** — `components/layout/**` imports `theme.ts`, `components/ui/`, `lib/`; never `core`, `adapters`, `features`, `routes`, `api.ts` or TanStack | `web-layouts-are-structure-only` (dependency-cruiser, same edge shape as `web-ui-is-presentational`) + a config-regression probe | LINT + TEST |
| **(b) Features consume layouts, they do not define them** — a `Container`/max-width/page grid may be declared only under `components/layout/` | none today: this is a claim about a file's *content*, not an edge in the graph | REVIEW+AI |

Rule (b) is documented as review-tier rather than dressed up as a guarantee. Its mechanical half closes when the structural `sx` tier below triggers — and not before.

### 3. The shell splits, it is not relabelled ✂️ \{#3-the-shell-splits-it-is-not-relabelled}

The chrome skeleton — app bar, nav slots, width tokens, `Outlet` slot — becomes `components/layout/AppShell.tsx` and holds no server state, so it passes rule (a) by construction. The data half — the `me` guard, the tenant switcher, the no-tenant onboarding branch — stays a thin composition beside `main.tsx` that *renders* `AppShell`. The same split is proven upstream, where the stateful panel layout stayed a feature and the panel skeleton became a primitive.

### 4. Visual specs ride the existing harness 📸 \{#4-visual-specs-ride-the-existing-harness}

Every layout skeleton carries screenshots of its states in the existing `demo/visual/` suite, on the ADR-0008 Playwright harness with CI-rendered, platform-scoped baselines. Lint catches scattered `sx`, pixels catch rendered drift, and one gate owns the pixels. The check stays non-required until the owner arms it, exactly as ADR-0008 left it.

### 5. The structural `sx` tier waits for a trigger ⏳ \{#5-the-structural-sx-tier-waits-for-a-trigger}

A second key category in `agentproofarch/sx-layout-only` would reserve `display`, `grid*`, `flex*` on containers, `position: sticky|fixed`, `width` and `maxWidth` for `components/layout/**` and `theme.ts`, on the same per-file, shrink-only, stale-erroring baseline the visual tier already uses.

**Status: NORMATIVE WHEN TRIGGERED. Trigger: the first case of a duplicated page skeleton outside `components/layout/` in an app on the foundation.** It waits because the tier is paper-only even in the app that designed it, so it has no field validation anywhere; shipping it now would make an unproven mechanism a mandatory gate. The first app to hit the trigger is also its first honest test.

## Alternatives considered 🔀 \{#alternatives-considered}

| Alternative | Verdict | Why |
|---|---|---|
| **Sanction the shell as a composition exception**, in the style of `api.ts` | rejected | Cheaper today, freezes the defect: the *next* page skeleton would still have nowhere to go, and the architecture would keep answering "put it in a feature". |
| **Port the seven-primitive catalog** (focus card, member page, panel page, list section, section card, status view, confirm dialog) and its width tokens | rejected | It is the codified result of a 44-screen inventory of *one product* and six product decisions. The foundation graduates the category and the rules; the catalog is an app's own output. `demo/` gets `AppShell` plus one status skeleton — "a change that would not generalise to every app on the foundation does not belong in it". |
| **Storybook + Lost Pixel**, or a second golden-image harness | rejected | [ADR-0008](./0008-visual-regression.md) already decided this repo's visual mechanism deliberately. A second screenshot engine duplicates it and breaks the single-source-of-baselines rule. |
| **Mandatory MUI skeleton-import bans** (`Container`/`AppBar`/`Drawer`/`Toolbar`) | rejected as mandatory | MUI-specific, and paper-only even upstream. Recorded as an **optional** closing technique for MUI apps, never part of the portable artifact. |
| **The seven-theme showcase** | rejected | Theme count and identity are product. What graduates is the principle it demonstrated: a skeleton that consumes theme atoms survives any theme. |

## Consequences ⚡ \{#consequences}

- **The frontend structure diagram gains a row**, and the route-tree prose stops calling the shell a feature under `features/settings/`. Both rules ship with the mandatory TYPE/LINT/TEST/REVIEW+AI matrix.
- **`web-layouts-are-structure-only` joins the portable-artifact list** beside `web-features-are-islands`; the rule, its boundaries entry and its config-regression probe land in the enforcer phase of the same change, together with the doc-lint manifest entry that promises it.
- **One non-trivial code move**: splitting the shell into `AppShell` plus a thin stateful composition. Everything else is documentation or a new file.
- **The two hand-rolled skeletons each become a named one** — the repeated `maxWidth: '44rem'` branches collapse into the shell's own state rendering, and the onboarding centred card becomes a layout skeleton.

:::caution[Honest caveats]
- **Rule (b) has no mechanical enforcement today.** Nothing stops a feature from growing a page skeleton in place until the structural tier triggers; it is a REVIEW+AI-tier rule, documented as such rather than presented as guaranteed.
- **The structural tier is unproven, not merely deferred.** It was designed by the app this layer was graduated from and never shipped there — the deferral is the point, not a scheduling accident.
:::
