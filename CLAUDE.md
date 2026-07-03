# agentproofarch — repo map for agents

- `docs/` — normative architecture (`architecture.md`) and the PRD. Read
  these before designing anything; PRD §3 is the contract.
- `demo/` — the entire implementation (own `package.json`; run all npm
  commands from `demo/`). Implementation rules, layer boundaries and the
  verification workflow live in `demo/CLAUDE.md`.

Changing the architecture means changing `docs/` first, then the code.
