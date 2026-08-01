import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural probe for the ADR-0013 review loop. Nothing else can cover it: the
 * `if:` expression IS the mechanism — GitHub evaluates it server-side, from
 * payload fields the commenter cannot set, before a job (and therefore a token)
 * exists — so no test can execute the guard. What a test CAN do is fail the
 * build when an edit widens it, which is the regression the ADR names: an
 * approver set that grows to `COLLABORATOR`, a comment body that reaches a
 * shell, or a gallery job that starts checking out the pull request it publishes
 * for while holding the only write token in the pipeline.
 */

const workflowsDir = join(import.meta.dirname, '..', '..', '.github', 'workflows');
const approveVisuals = readFileSync(join(workflowsDir, 'approve-visuals.yml'), 'utf8');
const ci = readFileSync(join(workflowsDir, 'ci.yml'), 'utf8');

const squashed = approveVisuals.replace(/\s+/g, ' ');

const jobBlock = (workflow: string, job: string): string => {
  const start = workflow.indexOf(`\n  ${job}:\n`);
  if (start < 0) throw new Error(`job ${job} not found`);
  const rest = workflow.slice(start + 1);
  const next = /\n {2}[a-z][a-z0-9-]*:\n/.exec(rest.slice(1));
  return next ? rest.slice(0, next.index + 1) : rest;
};

describe('approve-visuals guard chain', () => {
  it('triggers only on a created comment on a pull request', () => {
    expect(squashed).toContain('issue_comment: types: [created]');
    expect(squashed).toContain('github.event.issue.pull_request != null');
  });

  it('accepts the owner or an explicitly listed approver, and nobody else', () => {
    expect(squashed).toContain("github.event.comment.author_association == 'OWNER'");
    expect(squashed).toContain("fromJSON(vars.VISUAL_APPROVERS || '[]')");
    for (const association of ['COLLABORATOR', 'MEMBER', 'CONTRIBUTOR']) {
      expect(squashed).not.toContain(`author_association == '${association}'`);
    }
  });

  it('creates the write-capable job only after an exact command match', () => {
    expect(squashed).toContain("context.payload.comment.body.trim() === '/approve-visuals'");
    expect(jobBlock(approveVisuals, 'approve-visuals')).toContain('needs: guard');
  });

  it('never interpolates the comment body into a step', () => {
    expect(approveVisuals).not.toMatch(/\$\{\{[^}]*github\.event\.comment\.body/);
  });

  it('refuses a fork head and dispatches the gated baseline run for its own', () => {
    expect(squashed).toContain('steps.pull.outputs.head_repo != github.repository');
    expect(squashed).toContain('visual-baselines.yml/dispatches');
    expect(squashed).toContain('inputs[update]=true');
    expect(squashed).toContain('inputs[commit]=true');
  });
});

describe('visual-report publisher', () => {
  const publisher = jobBlock(ci, 'visual-report');

  it('holds the write scopes the gallery needs', () => {
    expect(publisher).toContain('contents: write');
    expect(publisher).toContain('pull-requests: write');
  });

  it('checks out the trusted base commit and never the pull-request head', () => {
    expect(publisher).toContain('ref: ${{ github.event.pull_request.base.sha }}');
    expect(publisher).not.toMatch(/ref:.*pull_request\.head/);
  });

  it('takes the head commit as data only — a URL component, never a ref', () => {
    const headSha = publisher
      .split('\n')
      .filter((line) => line.includes('github.event.pull_request.head.sha'))
      .map((line) => line.trim());
    expect(headSha).toEqual(['HEAD_SHA: ${{ github.event.pull_request.head.sha }}']);
  });

  it('skips a fork pull request instead of failing on its read-only token', () => {
    expect(publisher.replace(/\s+/g, ' ')).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository',
    );
  });

  it('leaves the job that runs pull-request code read-only', () => {
    expect(jobBlock(ci, 'visual')).not.toContain('permissions:');
  });
});
