import { describe, expect, it } from 'vitest';
import { seedPosition } from '../packages/intelligence/continuity/seed';
import { gateProposal } from '../packages/intelligence/continuity/ledger';
import { prepareEdition } from '../packages/orchestrator/prepareEdition';
import { computePriority } from '../packages/intelligence/position/rubric';
import { makeWorld } from './helpers';
import { SEED, fixturePages, scripts } from './fixtures';
import type { Claim, Position } from '../packages/contracts';

const opts = { localIssueDate: '2026-11-26', asOf: '2026-11-25T22:00:00.000Z' };

describe('012 Consequence Engine', () => {
  it('holds an impressive but speculative consequence that lacks a competing hypothesis', async () => {
    const base = scripts();
    const w = makeWorld({
      pages: fixturePages(),
      scripts: scripts({
        'consequence.synthesize': (i) => {
          const out = base['consequence.synthesize'](i) as any;
          out.consequences[0].alternatives = [];
          return out;
        },
      }),
    });
    const r = await prepareEdition(w.ctx, w.publishing, opts);
    expect(r.status).toBe('drafted');
    const cons = w.repo.listConsequences(r.run.id);
    expect(cons[0].status).toBe('held');
    expect(cons[0].holdReason).toMatch(/no competing explanation/);
  });

  it('holds a consequence the challenge pass rejects, and one that cites unverified evidence', async () => {
    const base = scripts();
    const w = makeWorld({
      pages: fixturePages(),
      scripts: scripts({
        'consequence.synthesize': (i) => {
          const out = base['consequence.synthesize'](i) as any;
          const second = { ...out.consequences[0], statement: 'A second consequence.', observedClaimIds: ['CLM-NOT-REAL'] };
          return { consequences: [out.consequences[0], second] };
        },
        'consequence.challenge': (i) => (i.consequence.statement.startsWith('Lower') ? { verdict: 'hold', neutralHeadlineTest: 'Does not follow.', findings: ['causal leap'] } : { verdict: 'pass', neutralHeadlineTest: 'ok', findings: [] }),
      }),
    });
    const r = await prepareEdition(w.ctx, w.publishing, opts);
    const cons = w.repo.listConsequences(r.run.id);
    expect(cons.map((c) => c.status)).toEqual(['held', 'held']);
    expect(cons[0].holdReason).toMatch(/challenge verdict hold/);
    expect(cons[1].holdReason).toMatch(/not verified signal claims/);
    // With no accepted consequence there is no position: the edition states that explicitly
    if (r.status === 'drafted') expect(r.issue.content!.position).toBeNull();
  });
  it('returns a "revise" consequence for one bounded revision round, then re-challenges it', async () => {
    let n = 0;
    const w = makeWorld({
      pages: fixturePages(),
      scripts: scripts({
        'consequence.challenge': () => (n++ === 0 ? { verdict: 'revise', neutralHeadlineTest: 'Overstated.', findings: ['states inference as fact'] } : { verdict: 'pass', neutralHeadlineTest: 'Now follows.', findings: [] }),
        'consequence.revise': (i) => ({ ...i.consequence, statement: `If price is the constraint, ${i.consequence.statement.toLowerCase()}` }),
      }),
    });
    const r = await prepareEdition(w.ctx, w.publishing, opts);
    const [c] = w.repo.listConsequences(r.run.id);
    expect(c.status).toBe('accepted');
    expect(c.statement).toMatch(/^If price is the constraint/);
    expect(c.challenge!.findings).toContain('(passed after one revision round)');
  });
});

describe('012 Position Engine', () => {
  it('does not call a commercial idea with unverified buyer demand a validated PURSUE', async () => {
    const w = makeWorld({ pages: fixturePages(), scripts: scripts({ 'position.adversarial_review': () => ({ findings: [], verdict: 'pass', decisiveObstacle: 'x', smallestNextTest: 'y' }) }) });
    const r = await prepareEdition(w.ctx, w.publishing, opts);
    const [cand] = w.repo.listCandidates(r.run.id);
    expect(cand.proposedDecision).toBe('PURSUE');
    expect(cand.decision).toBe('MONITOR');
    expect(cand.decisionGateNotes.join(' ')).toMatch(/critical factor\(s\) unknown — customerUrgency, monetization/);
    expect(cand.scorecard!.priority).toBeNull();
    expect(cand.scorecard!.unscoredWeightedDimensions).toEqual(['customerUrgency', 'monetization']);
  });

  it('removes a named competitor that has no verified evidence', async () => {
    const base = scripts();
    const w = makeWorld({
      pages: fixturePages(),
      scripts: scripts({
        'position.generate_candidates': (i) => {
          const o = base['position.generate_candidates'](i) as any;
          o.candidates[0].competitors = [{ name: 'Imaginary Corp', relevance: 'rival', claimIds: [] }];
          return o;
        },
      }),
    });
    const r = await prepareEdition(w.ctx, w.publishing, opts);
    const [cand] = w.repo.listCandidates(r.run.id);
    expect(cand.competitors).toEqual([]);
    expect(cand.decisionGateNotes.join(' ')).toMatch(/Imaginary Corp" removed/);
  });

  it('rejects a position with no falsifiable test and publishes an explicit no-position conclusion', async () => {
    const base = scripts();
    const w = makeWorld({
      pages: fixturePages(),
      scripts: scripts({
        'position.generate_candidates': (i) => {
          const o = base['position.generate_candidates'](i) as any;
          o.candidates[0].falsificationTest = null;
          return o;
        },
      }),
    });
    const r = await prepareEdition(w.ctx, w.publishing, opts);
    const [cand] = w.repo.listCandidates(r.run.id);
    expect(cand.status).toBe('rejected');
    expect(cand.rejectionReason).toMatch(/falsifiable/);
    if (r.status === 'drafted') {
      expect(r.issue.content!.position).toBeNull();
      expect(r.issue.content!.noPositionStatement).toMatch(/Monitor; no action/);
    }
  });

  it('routes an existing opportunity mentioned in a new signal to the ledger instead of duplicating it', async () => {
    const base = scripts();
    const w = makeWorld({
      pages: fixturePages(),
      scripts: scripts({
        'position.generate_candidates': (i) => {
          const o = base['position.generate_candidates'](i) as any;
          o.candidates[0].thesis = SEED.thesis; // restates the tracked thesis
          return o;
        },
      }),
    });
    await seedPosition(w.ctx, SEED);
    const r = await prepareEdition(w.ctx, w.publishing, opts);
    const [cand] = w.repo.listCandidates(r.run.id);
    expect(cand.status).toBe('routed_to_continuity');
    expect(cand.extendsPositionId).toBe('POS-000001');
  });

  it('computes the internal priority only from assessable weighted inputs and never double-counts caution factors', () => {
    const dims = Object.fromEntries(
      ['executionFit', 'marketAttractiveness', 'marketSaturation', 'customerUrgency', 'monetization', 'reachableMarketGrowth', 'differentiation', 'distributionFeasibility', 'mvpFeasibility', 'capitalEfficiency', 'scalability', 'timing', 'executionRegulatoryRisk', 'evidenceConfidence'].map((k) => [
        k,
        { score: k === 'marketSaturation' || k === 'executionRegulatoryRisk' ? 9 : 5, rationale: 'r', unknown: false },
      ]),
    ) as any;
    const p = computePriority(dims);
    expect(p.priority).toBe(5); // saturation/risk 9 do not enter the sum
    expect(p.cautionFlags).toEqual(expect.arrayContaining(['crowded market: differentiation and distribution must be evidenced', 'high execution/regulatory risk']));
  });
});

describe('012 Continuity Ledger', () => {
  const pos = { id: 'POS-000009', currentStatus: 'EMERGING', validationConditions: ['A'], invalidationConditions: ['B'], originalThesis: 't' } as unknown as Position;
  const run = { id: 'RUN-X' } as any;
  const claim = { id: 'CLM-NEW', text: 'new evidence' } as Claim;
  const m = { position: pos, matchedBy: ['entity' as const], matchDetail: 'x', signalIds: [] };

  it('rejects a status change without new supporting evidence', () => {
    const p = gateProposal(run, m, [claim], { effect: 'material_change', proposedStatus: 'STRENGTHENING', whyThisAltersJudgment: 'because', conditionRefs: [], citedClaimIds: [], publicLine: 'x' });
    expect(p.status).toBe('rejected');
    expect(p.gate.reasons.join(' ')).toMatch(/without cited new supporting evidence/);
    expect(p.proposedStatus).toBe('EMERGING');
  });

  it('requires a prespecified condition for VALIDATED and INVALIDATED', () => {
    const v = gateProposal(run, m, [claim], { effect: 'material_change', proposedStatus: 'VALIDATED', whyThisAltersJudgment: 'good news', conditionRefs: [], citedClaimIds: ['CLM-NEW'], publicLine: 'x' });
    expect(v.status).toBe('rejected');
    const ok = gateProposal(run, m, [claim], { effect: 'material_change', proposedStatus: 'VALIDATED', whyThisAltersJudgment: 'condition met', conditionRefs: ['V1'], citedClaimIds: ['CLM-NEW'], publicLine: 'x' });
    expect(ok.status).toBe('proposed');
    const inv = gateProposal(run, m, [claim], { effect: 'material_change', proposedStatus: 'INVALIDATED', whyThisAltersJudgment: 'x', conditionRefs: ['V1'], citedClaimIds: ['CLM-NEW'], publicLine: 'x' });
    expect(inv.status).toBe('rejected');
  });

  it('links adjacent evidence without altering status and refuses citations of non-new claims', () => {
    const adj = gateProposal(run, m, [claim], { effect: 'adjacent', proposedStatus: 'EMERGING', whyThisAltersJudgment: 'related', conditionRefs: [], citedClaimIds: ['CLM-NEW'], publicLine: '' });
    expect(adj.status).toBe('linked_only');
    const foreign = gateProposal(run, m, [claim], { effect: 'material_change', proposedStatus: 'WEAKENING', whyThisAltersJudgment: 'x', conditionRefs: [], citedClaimIds: ['CLM-OLD'], publicLine: 'x' });
    expect(foreign.status).toBe('rejected');
  });
});
