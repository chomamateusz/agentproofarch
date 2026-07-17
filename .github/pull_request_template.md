## What & why

<!-- One or two sentences. Link the issue/PRD section. -->

## Checklist (no exceptions)

- [ ] `npm run check` is green (typecheck + lint + lock-lint + depcruise + doc-lint + coverage)
- [ ] `npm run smoke` is green (real server boots and the CLI flow passes)
- [ ] `npm run e2e` is green — for any `apps/web` change
- [ ] Architecture change? `docs/` updated first, then the code
- [ ] New dependencies added via `npx -y npm@10 install` only (never plain `npm install`)
- [ ] Work done in a git worktree, not on the main checkout
