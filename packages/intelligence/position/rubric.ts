import { RUBRIC_DIMENSIONS, type RubricDimension, type Scorecard } from '../../contracts';

/**
 * Internal commercial-priority formula (PRD §8, Architecture §7). Product
 * defaults, not measured market facts. Saturation, execution/regulatory risk
 * and evidence confidence are caution/override dimensions and are NOT added
 * or subtracted again; reachable market and timing are assessed separately.
 */
export const PRIORITY_WEIGHTS: Partial<Record<RubricDimension, number>> = {
  executionFit: 0.2,
  marketAttractiveness: 0.2,
  customerUrgency: 0.1,
  monetization: 0.1,
  differentiation: 0.1,
  distributionFeasibility: 0.1,
  mvpFeasibility: 0.1,
  capitalEfficiency: 0.05,
  scalability: 0.05,
};

export const CRITICAL_FOR_PURSUE: RubricDimension[] = ['marketAttractiveness', 'customerUrgency', 'monetization', 'evidenceConfidence'];

export function computePriority(dimensions: Scorecard['dimensions']): { priority: number | null; unscored: string[]; cautionFlags: string[] } {
  const unscored = Object.keys(PRIORITY_WEIGHTS).filter((k) => {
    const d = dimensions[k as RubricDimension];
    return d.score === null || d.unknown;
  });
  let priority: number | null = null;
  if (!unscored.length) {
    const v = Object.entries(PRIORITY_WEIGHTS).reduce((acc, [k, w]) => acc + (w ?? 0) * (dimensions[k as RubricDimension].score ?? 0), 0);
    priority = Math.round(v * 10) / 10; // one decimal: no meaningless precision
  }
  const cautionFlags: string[] = [];
  const s = (k: RubricDimension) => dimensions[k].score;
  if ((s('marketSaturation') ?? 0) >= 8) cautionFlags.push('crowded market: differentiation and distribution must be evidenced');
  if ((s('executionRegulatoryRisk') ?? 0) >= 8) cautionFlags.push('high execution/regulatory risk');
  const ec = s('evidenceConfidence');
  if (ec === null || ec <= 3) cautionFlags.push('low evidence confidence');
  for (const k of RUBRIC_DIMENSIONS) if (dimensions[k].unknown) cautionFlags.push(`unknown: ${k}`);
  return { priority, unscored, cautionFlags: [...new Set(cautionFlags)] };
}
