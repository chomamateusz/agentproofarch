## What & why

<!-- One or two sentences. Link the issue/PRD section. -->

## Checklist (no exceptions)

- [ ] `pnpm run check` is green (typecheck + lint + lock-lint + depcruise + doc-lint + coverage)
- [ ] `pnpm run smoke` is green (real server boots and the CLI flow passes)
- [ ] `pnpm run e2e` is green — for any `apps/web` change
- [ ] Architecture change? `docs/` updated first, then the code
- [ ] Behaviour-visible change? `website/docs` updated **and** a `CHANGELOG.md` entry added here (review-enforced, not gated)
- [ ] New dependencies added via `pnpm add`; `onlyBuiltDependencies` changed only for a demonstrated gate failure
- [ ] Work done in a git worktree, not on the main checkout
- [ ] No rerun-to-green: if any gate run was flaky (e.g. green only via the Playwright retry), a P1 is filed and linked here
