import { hashJson } from '../contracts';
import type { ObjectStore } from '../connectors/storage/objectStore';
import { ratifyProposal } from '../intelligence/continuity/ledger';
import type { IssueRecord, Repository } from '../persistence/repository';
import type { PreflightReport } from './preflight';

export class ApprovalError extends Error {}

export const preflightKey = (issueId: string, version: number) => `review/${issueId}/v${version}/preflight.json`;
export const manifestKey = (issueId: string, version: number) => `review/${issueId}/v${version}/source-review-manifest.md`;

/**
 * Human release authority. Approval validates editorial release, not truth.
 * It binds to the exact content hash the editor reviewed, ratifies the
 * continuity proposals contained in the issue as append-only revisions, and
 * locks first-time positions (original thesis immutable from here on).
 */
export async function approveIssue(
  repo: Repository,
  store: ObjectStore,
  a: { issueId: string; editor: string; note?: string; expectedSha256?: string },
): Promise<{ issue: IssueRecord; approvalId: string; revisions: string[] }> {
  const issue = repo.getIssue(a.issueId);
  if (!a.editor.trim()) throw new ApprovalError('editor identity is required');
  if (issue.state !== 'DRAFTED' && issue.state !== 'HELD_FOR_APPROVAL') throw new ApprovalError(`issue is ${issue.state}; only a drafted issue can be approved`);
  const c = issue.content;
  if (!c) throw new ApprovalError('issue has no content');
  const sha = hashJson(c);
  if (sha !== issue.contentSha256) throw new ApprovalError('stored content hash mismatch');
  if (a.expectedSha256 && !sha.startsWith(a.expectedSha256)) throw new ApprovalError(`content changed since review: expected ${a.expectedSha256}, found ${sha.slice(0, 16)}`);
  const pfText = await store.getText(preflightKey(a.issueId, c.version));
  if (!pfText) throw new ApprovalError(`no preflight report for version ${c.version}`);
  const pf = JSON.parse(pfText) as PreflightReport;
  if (pf.blocking) throw new ApprovalError(`preflight has blocking failures: ${pf.checks.filter((x) => !x.passed && x.severity === 'block').map((x) => x.id).join(', ')}`);
  const manifest = await store.getText(manifestKey(a.issueId, c.version));
  if (!manifest) throw new ApprovalError('the editor must have the source-review manifest; none was generated for this version');

  return repo.transaction(() => {
    const approvalId = repo.recordApproval({
      issueId: a.issueId,
      issueVersion: c.version,
      contentSha256: sha,
      editor: a.editor,
      decision: 'approve',
      note: a.note,
      manifestSha256: hashJson(manifest),
    });
    repo.lockApprovedSnapshot(a.issueId, c, sha);
    const revisions: string[] = [];
    for (const e of c.continuity) {
      const p = repo.getProposal(e.proposalId);
      if (!p) throw new ApprovalError(`continuity proposal ${e.proposalId} missing`);
      revisions.push(ratifyProposal(repo, p, approvalId, a.issueId).id);
    }
    if (c.position?.isNew) repo.markPositionPublished(c.position.positionId, a.issueId);
    const updated = repo.transitionIssue(a.issueId, 'EDITOR_APPROVED', a.editor, `approval ${approvalId} of v${c.version} (${sha.slice(0, 16)})`);
    return { issue: updated, approvalId, revisions };
  });
}

export function requestRevision(repo: Repository, issueId: string, editor: string, note: string): IssueRecord {
  const issue = repo.getIssue(issueId);
  if (!issue.content) throw new ApprovalError('issue has no content');
  repo.recordApproval({ issueId, issueVersion: issue.content.version, contentSha256: issue.contentSha256 ?? '', editor, decision: 'request_revision', note });
  return issue.state === 'HELD_FOR_APPROVAL' ? repo.transitionIssue(issueId, 'DRAFTED', editor, `revision requested: ${note}`) : issue;
}

export function holdIssue(repo: Repository, issueId: string, editor: string, note: string): IssueRecord {
  const issue = repo.getIssue(issueId);
  repo.recordApproval({ issueId, issueVersion: issue.content?.version ?? 0, contentSha256: issue.contentSha256 ?? '', editor, decision: 'hold', note });
  return repo.transitionIssue(issueId, 'HELD_FOR_EVIDENCE', editor, `held by editor: ${note}`);
}
