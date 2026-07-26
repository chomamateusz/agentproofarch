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
