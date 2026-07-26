# agentproofarch documentation site

Docusaurus 3 (TypeScript) site published to GitHub Pages at
<https://chomamateusz.github.io/agentproofarch/>.

```bash
cd website
pnpm install --frozen-lockfile
pnpm start          # dev server
pnpm run build      # what CI runs; broken links fail the build
pnpm run typecheck
```

`docs/changelog.md` is **generated** from the repository-root `CHANGELOG.md` by
`scripts/sync-changelog.mjs` (wired as `prestart`/`prebuild`) and is gitignored —
edit the root file.

The normative architecture documents stay in `docs/` at the repository root; pages
here summarise them and link back. Where the two disagree, the repository wins.

`onBrokenLinks` and `onBrokenAnchors` are `throw`, so a dead cross-reference fails
`pnpm run build` — which is what `docs-ci.yml` runs on every PR touching `website/`
or `CHANGELOG.md`.
