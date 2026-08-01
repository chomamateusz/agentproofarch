# accessibility audit

## Purpose

Answer whether a person who does not use a mouse, does not see the screen, or
cannot perceive a colour difference can complete the flows this product ships:
sign in, read a board, act on it, manage a tenant. The rest of the roster is
blind to this by construction — [`consistency.md`](consistency.md) checks that
the UI and the server agree, [`docs-truth.md`](docs-truth.md) that the docs and
the code agree, and both pass cleanly on an interface nobody can operate with a
keyboard.

## Standard reference

**WCAG 2.2 Level AA** (W3C Recommendation, republished 12 December 2024;
approved as **ISO/IEC 40500:2025** in October 2025) is the acceptance standard.
Findings cite the success criterion they fail, at the AA level.

**axe-core 4.12.x** is the automation, run through `@axe-core/playwright`
against the pages the existing Chromium jobs already load.

**What is not claimed, in the strongest terms this roster uses.** Automation
does not measure conformance. Deque's published coverage study — 13,000+ page
states, 2,000+ audits, ~300,000 issues — found that **57.38%** of total issues
were identified by its automated tests. The remaining ~43% are found by people.
An all-green axe run therefore proves that a specific subset of machine-checkable
rules did not trigger on the states that were loaded; it proves **nothing** about
AA conformance, and any report that presents a green run as "accessible" is
making a claim this spec explicitly forbids. A spec that stopped at the
automatable subset would be a compliance theatre generator, so the manual
checks below are mandatory, not optional.

## Reference standard

The rendered application in a real browser — the same Chromium the `e2e` and
`visual` jobs drive — and the built documentation site. Source is evidence, not
ground truth: an accessible-looking component tree can still render an
unreachable focus order, and an `aria-label` in the JSX is a claim about the
accessibility tree, not proof of one.

## Method

- Run axe (`@axe-core/playwright`, rules at the WCAG 2.2 AA tag set) over every
  page state the e2e suite already reaches: the landing and login pages, the
  authenticated board, the team board, the settings surfaces, and at least one
  error and one empty state. Record the page states covered — the state list is
  the real scope of the run, and an unvisited state is unaudited, not passing.
- Keyboard-only pass, by hand, on the same states: reach every interactive
  control with `Tab` in an order that matches the visual order, operate it with
  `Enter`/`Space`, escape every dialog, and confirm focus is visible at every
  stop and returns somewhere sensible when a dialog closes. Dialogs and the
  boot splash are the two places focus is most likely to be lost here.
- Read the alt text and accessible names for *meaning*, not presence: axe
  reports a missing `alt`, never a wrong one. An icon button named "button", an
  image named after its filename, and a decorative image with a description are
  three findings axe cannot see.
- Check colour independence: no state (error, selected, required, diff status)
  may be conveyed by colour alone. Confirm contrast on the states axe reads
  statically *and* on the ones it cannot — hover, focus, disabled.
- Check the reduced-motion and zoom paths: content readable at 200% zoom, and
  no animation that ignores `prefers-reduced-motion`.
- For every finding, name the success criterion and whether a machine or a
  person found it. The machine/person split is the number that tells the next
  run whether the automated subset is worth what it costs.

## Automatable checks

| Check | Tool | Wired today |
|---|---|---|
| WCAG 2.2 AA machine-checkable rules over e2e page states | `@axe-core/playwright` (axe-core 4.12.x) | **No** — the Chromium jobs it would ride on already exist, so this is cheap to add, but adding it is an owner decision, not this spec's to make |
| Lighthouse accessibility category, documentation site only | `lhci.yml` (advisory, `warn`) | Yes — see [`performance.md`](performance.md) for what that job is and is not |

Both are the same ~57% subset of one page state at a time. Neither reduces the
manual pass; the automated half exists to stop regressions cheaply between
audits, not to answer the question the audit asks.

**The documentation site already warns, and the threshold stays where it is.**
A local run of the wired job (LHCI 0.15.1, Lighthouse 12.6.1, desktop preset,
2026-08-01) scores the landing page 0.96 on Lighthouse's accessibility category
and the longer doc pages **0.92**, under the 0.95 assertion, on two audits:
image alt text that repeats adjacent text, and links inside paragraphs
distinguished by colour alone. Both are real, both are worth fixing, and
lowering the assertion to make the warning disappear would be the exact move
this roster exists to catch.

## What counts as a finding

- A WCAG 2.2 AA success criterion demonstrably failed on a page state the audit
  loaded — cite the criterion and the state.
- An interactive control unreachable or unoperable by keyboard, or a focus trap
  with no escape.
- An accessible name that is present but wrong or meaningless (the class of
  finding automation structurally cannot produce).
- Information conveyed by colour alone.
- A previously-audited state that regressed since the last run.

Not a finding: a Level AAA criterion missed (out of scope unless the owner
raises the target), or an axe rule flagged as `incomplete` with no manual
confirmation — an unreviewed `incomplete` is a task, not a defect.

## Known blind spots

- **The automated half sees ~57% of issues and 0% of conformance.** This is the
  spec's defining limit, restated here because it is the one a reader skimming
  for a green light will miss.
- Only the page states the run visits are audited. Authenticated deep states,
  long boards, and error paths that need a broken backend are the states most
  likely to go unvisited, and therefore the states most likely to be broken.
- Assistive-technology behaviour is not tested. This audit checks the
  accessibility tree and keyboard operation; it does not run VoiceOver, NVDA or
  JAWS, and a tree that reads correctly to axe can still be announced
  confusingly. Real AT verification needs a person with that AT.
- Cognitive accessibility (plain language, error recovery, timeout pressure) is
  barely touched by AA criteria and not at all by tooling.
- No baseline exists yet: the first run produces a state list and a finding
  count, not a trend. Treat run one as inventory.
