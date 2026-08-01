# consistency audit

## Purpose

Confirm the parallel surfaces this repo maintains for the same capability —
contract types, server routes, CLI commands, web UI, and docs describing all
of the above — actually agree with each other. A capability that exists on
one surface but not another is exactly the shape of finding this audit is
built to catch (US-027's member export, PARTIAL in the 2026-08-01 audit
because it's JSON-only despite the contract/FR-22 promising CSV too, is a
worked example).

## Standard reference

**OWASP ASVS 5.0.0, V8 Authorization** for the permission-parity half only.
The rule below — an operation gated behind a role in the server must be gated
behind the same role check in the UI, and hiding a button is not authorization
— is a restatement of V8's function-level access control requirements, so a
parity finding cites the chapter instead of asserting a preference.

**OWASP API Security Top 10:2023** (`API1` Broken Object Level Authorization,
`API5` Broken Function Level Authorization) is the right vocabulary for naming
the *risk* in a report. It is an awareness taxonomy, not an auditable control
set: cite ASVS V8 as the requirement and the API Top 10 entry as the risk
name, never the reverse.

**What is not claimed:** everything else this audit checks — surface parity
across contract, server, CLI, UI and docs — has no standard behind it. Naming
**ISO/IEC 25010:2023** *Compatibility / Interoperability* as the taxonomy
label is honest shorthand for "this is a recognized quality attribute", not a
conformance claim; 25010 has no requirement IDs and no test.

## Reference standard

The contract package (`demo/contracts/` or equivalent — the single source of
truth for request/response shapes) as the spine; every other surface
(server route implementation, CLI command, web UI component, docs page) is
checked against it and against each other.

## Method

- For every contract-defined operation, confirm: a server route implements
  it, a CLI command exposes it (if the CLI is meant to be a full client —
  check `website/docs/guides/cli-reference.md` for which operations are
  CLI-reachable by design vs deliberately server/UI-only), a web UI surface
  exposes it (if the UI is meant to be a full client), and a docs page
  (guide or reference) describes it.
- Where a contract operation supports optional parameters or multiple
  response shapes (e.g. an export endpoint supporting both CSV and JSON),
  confirm every surface that claims to support the operation supports the
  *full* parameter/response space the contract declares — a UI or CLI that
  only implements a subset silently is a finding even if the subset it does
  implement works correctly.
- For CRUD-shaped capabilities (member management, tenant management),
  build a small matrix per capability: create / read / update / delete /
  list, columns = contract / server / CLI / UI. Any cell that's "no" where
  the reference standard expects "yes" is a finding; a deliberate "no" needs
  a citation to `docs/backlog.md` or an explicit non-goal in the PRD/arch
  OUT-OF-SCOPE block.
- Cross-check terminology: the same concept must be named the same thing
  across contract field names, CLI flag names, UI copy, and docs prose (a
  field called `tenant` in the contract but `organization` in the UI is a
  finding — it's a support/onboarding cost even when technically correct).
- Check permission/authorization parity: an operation gated behind a role in
  the server must be gated behind the *same* role check in the UI (hiding a
  button is not authorization, but a UI that shows a button for a role that
  the server will reject is a consistency finding, and the inverse — server
  allows, UI never offers — is also worth recording even though it's safe,
  because it's usually accidental).

## Automatable checks

**None wired, and little is automatable.** TypeScript proves that a server
handler and a client caller agree on the *shape* the contract declares; it
proves nothing about a CLI flag that was never written, a UI that implements
half a parameter space, a docs page describing last month's behaviour, or two
surfaces naming the same concept differently. The CRUD matrix is built by
reading, and the reading is the audit.

## What counts as a finding

- A contract operation with no server implementation, or vice versa (an
  implemented route with no contract entry — undocumented surface).
- A CLI or UI surface implementing only part of a contract operation's
  parameter/response space without documenting the reduction.
- Divergent naming for the same concept across contract/CLI/UI/docs.
- A permission check present on one surface (server) and absent or looser
  on another (UI) for the same operation.
- A docs page (guide, reference, changelog) describing a surface behaviour
  that doesn't match what the actual CLI/UI does today.

## Known blind spots

- Does not judge whether a deliberate asymmetry (CLI-only admin operations,
  UI-only convenience flows) is the *right* design choice — only whether
  it's undocumented. A cited non-goal is not a finding here even if it
  seems like a gap; see [`completeness.md`](completeness.md) for whether the
  gap itself should exist at all.
- Cannot detect naming inconsistency in prose that never became a literal
  code identifier (e.g. two docs pages describing the same feature with
  different metaphors) unless the audit run explicitly includes a prose
  pass — the default method above is code-surface-first.
- Runtime authorization parity is checked by reading the code, not by
  driving the app; an audit that wants live confirmation should pair this
  spec with `codex-computer-use` verification, which this spec does not
  itself require.
