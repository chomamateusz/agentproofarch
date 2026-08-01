# external-links audit

## Purpose

Confirm links leaving the repository — to GitHub (PRs, issues, commits), to
third-party documentation, to vendor dashboards, to anything not resolvable
by the doc-lint dead-link check — still resolve to what the citing text
claims they resolve to. `pnpm run check`'s doc-lint already catches dead
*relative* and *site-absolute* links; this audit is specifically the
external, off-site half doc-lint does not cover.

## Standard reference

**None — and that is the honest answer.** There is no standard for link
integrity, and naming one to fill the field would be exactly the kind of
unearned citation the rest of this roster exists to catch. This spec is
anchored to the live web and nothing else.

## Reference standard

The live target of each link (HTTP 200 + content matching the citation
context) as of the audit run. Link rot is time-dependent, so this audit's
findings have a shorter shelf life than the others in this roster — re-run
periodically rather than treating a clean pass as durable.

## Method

- Grep `docs/`, `website/docs/`, `README.md`, `CHANGELOG.md` and root
  `CLAUDE.md`/`AGENTS.md` for `https://` links; exclude the site's own
  domain (already covered by doc-lint) and localhost/example placeholders.
- For each GitHub link (PR, issue, commit, file-at-ref), confirm: it
  resolves (not 404), and if it's a PR/issue link, that the linked item's
  title/state roughly matches what the citing prose claims about it (a PR
  cited as "landed the fix" that's still open, or was later reverted, is a
  finding even though the link itself resolves).
- For each third-party doc link (framework docs, npm package pages, ADR
  citations to external specs), confirm the target still exists at that URL
  — vendors reorganize docs sites often enough that this is the single
  highest-churn category.
- For links into `docs/decisions/*.md` (ADRs) from other docs, confirm the
  ADR number/title cited matches the actual file (an ADR renumbered or
  superseded without updating its inbound citations is a finding shared
  with [`docs-truth.md`](docs-truth.md), but is caught by this audit's
  crawl regardless).
- Note: this audit needs outbound network access, which most of this
  repo's other checks explicitly avoid (see the agent-boundary rules in
  `website/docs/guides/agent-workflow.md` — no production DB reachable from
  an agent shell, but that rule is about production infrastructure, not
  read-only GET requests to public docs/GitHub, which this audit requires).

## Automatable checks

Resolution is automatable and the crawl should be scripted (authenticated
`gh api` for GitHub targets, plain requests for the rest); `doc-lint` and the
Docusaurus build already cover the relative and site-absolute half. Nothing
automatable decides the two findings this audit actually cares about: whether
a link's *current content* still supports the sentence citing it, and whether
a 200 came from the cited page or from a homepage the vendor redirected to.
No such job is wired in CI — a scheduled crawl would report link rot that
predates the pull request it lands on, which is noise on a gate and fine in an
audit.

## What counts as a finding

- A link returning 404/410 or redirecting to a generic "page not found"
  landing.
- A GitHub PR/issue link whose current state contradicts the citing prose
  (claims "landed" but PR is closed-unmerged or still open).
- A link to a moved page that now 200s on unrelated content (silent
  redirect to a homepage, not the cited section).
- A cross-repo or cross-doc citation (ADR number, PR number) that no longer
  matches the artifact it names.

## Known blind spots

- Cannot detect a link that resolves correctly today but to content that
  will change later (e.g. a link to "latest" release notes) — flag such
  links as a *style* note (should pin to a version/commit) even when not a
  present-tense finding.
- Rate limits on GitHub's unauthenticated API can produce false negatives
  on a large crawl; a full run should use an authenticated `gh api` call
  rather than raw HTTP HEAD requests where possible.
- Does not check that a link is the *right* citation for the claim being
  made (a resolving-but-irrelevant link) beyond the PR/issue state check
  above — deeper "does this citation actually support this sentence"
  judgment stays a docs-truth / human-review concern.
