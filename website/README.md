# agentproofarch documentation site 🔷

Docusaurus 3 (TypeScript) site published to GitHub Pages at
<https://chomamateusz.github.io/agentproofarch/>.

```bash
cd website
npm ci
npm start          # dev server
npm run build      # what CI runs; broken links fail the build
npm run typecheck
```

`docs/changelog.md` is **generated** from the repository-root `CHANGELOG.md` by
`scripts/sync-changelog.mjs` (wired as `prestart`/`prebuild`) and is gitignored —
edit the root file.

The normative architecture documents stay in `docs/` at the repository root; pages
here summarise them and link back. Where the two disagree, the repository wins.

`onBrokenLinks` and `onBrokenAnchors` are `throw`, so a dead cross-reference fails
`npm run build` — which is what `docs-ci.yml` runs on every PR touching `website/`
or `CHANGELOG.md`.

## Audience & style

- **Target reader**: a mid-level developer who has never worked with
  architecture at this rigor — precise enough that an architect still extracts
  everything.
- **Explain every term at first use**: a plain-language gloss inline, plus a
  link to the deeper page. Never use a term before defining it.
- **Short paragraphs**, generous line breaks — no walls of text.
- **Emoji on headings**: every heading on an authored docs page carries exactly
  one trailing meaning-matched emoji (the generated `changelog.md` is exempt),
  plus an explicit `\{#id}` — the plain slug of the heading text without the
  emoji, so anchors stay emoji-free. Elsewhere emoji stay sparse: at most one
  per key table cell, never mid-sentence.
- **🔷 is the official brand emoji**, reserved for brand titles — the landing
  page H1, the root `README.md` title and this README's title — and never used
  to decorate a regular section. It may be used as 🔷🔷🔷 as a ceremonial
  variant in announcements.
- **No claim that is not verifiable in the repo.** Facts come from `docs/`,
  the source tree or the gates — invented claims are a defect.
