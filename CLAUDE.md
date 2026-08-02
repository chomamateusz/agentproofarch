# agentproofarch — repo map for agents

- `docs/` — normative architecture (`architecture.md`) and the PRD. Read
  these before designing anything; PRD §3 is the contract.
- `demo/` — the entire implementation (own `package.json`; run all pnpm
  commands from `demo/`). Implementation rules, layer boundaries and the
  verification workflow live in `demo/CLAUDE.md`.
- `website/` — the Docusaurus documentation site (own `package.json`) published
  to GitHub Pages. `website/docs/changelog.md` is generated from the root
  `CHANGELOG.md`; edit the root file.

Changing the architecture means changing `docs/` first, then the code.

## Docs and changelog travel with the change

A behaviour-visible change — a new or changed capability, CLI command, route,
env var, gate or operational procedure — updates `website/docs` **and** adds a
`CHANGELOG.md` entry (Keep a Changelog format, one factual line + PR link) in
the **same PR**. Pure refactors, test-only and internal-comment changes do not.
This is a convention enforced by review and the PR checklist, **not** by a gate.

## Commit and PR titles

Commits and PR titles use a gitmoji-style convention: exactly one leading emoji,
then an imperative summary — `<emoji> <imperative summary>`. Recurring PR types
use a fixed emoji from the table below; anything else picks the closest match.

| Emoji | Type |
|---|---|
| 🎓 | promotion main -> production |
| 🔖 | release cut |
| ✨ | feature |
| 🐛 | bugfix |
| 📝 | docs |
| ✅ | tests |
| ⬆️ | dependency bumps |
| 🔒 | security/CI hardening |
| 🖼️ | UI/visual baselines |
| ♻️ | refactor |

PR titles are enforced by human review — nothing mechanical checks them; the
`ai-review` gate reads only the diff and has no GitHub API access to the PR
title. Commit messages are visible to the gate via `git log`, but the
convention as a whole is REVIEW-tier, not gate-tier.
`CHANGELOG.md` entries stay emoji-free — factual lines only.
