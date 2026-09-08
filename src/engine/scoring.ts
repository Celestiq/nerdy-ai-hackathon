import type { ConceptGraph } from "../graph/loader.js";
import { frontier, blame, type BeliefLookup } from "../graph/query.js";
import type { BeliefInternal } from "../store/types.js";

export interface ScoredCandidate {
  concept_id: string;
  score: number;
  components: {
    frontierValue: number;
    uncertainty: number;
    retrievalDue: number;
    blameBoost: number;
    cohortNeed: number;
  };
}

const WEIGHTS = {
  frontier: 0.35,
  uncertainty: 0.25,
  retrievalDue: 0.2,
  blame: 0.15,
  cohort: 0.05,
};

/** Concepts that active misconceptions elsewhere point back at as root cause. */
function blameTargets(graph: ConceptGraph, belief: Map<string, BeliefInternal>): Map<string, number> {
  const targets = new Map<string, number>();
  for (const b of belief.values()) {
    for (const sig of b.signatures) {
      if (sig.count === 0) continue;
      for (const suspect of blame(graph, b.concept_id, sig.code)) {
        const prev = targets.get(suspect.concept_id) ?? 0;
        targets.set(suspect.concept_id, Math.max(prev, suspect.weight));
      }
    }
  }
  return targets;
}

/**
 * Scoring signals, each independently computed and independently testable.
 * See architecture.html #engine "Scoring signals".
 */
export function scoreCandidates(
  graph: ConceptGraph,
  belief: Map<string, BeliefInternal>,
  candidates: string[],
  cohortNeeds: Set<string> = new Set(),
): ScoredCandidate[] {
  const lookup: BeliefLookup = (id) => belief.get(id);
  const frontierSet = new Set(frontier(graph, lookup));
  const blames = blameTargets(graph, belief);

  const scored = candidates.map((conceptId) => {
    const b = belief.get(conceptId);
    const node = graph.node(conceptId)!;

    const frontierValue = frontierSet.has(conceptId) ? 1 : 0.3;
    const uncertainty = 1 - (b?.confidence ?? 0);
    const retrievalDue = b && b.status === "DECAYED" ? clamp01(node.mastery_threshold - b.p_decayed) : 0;
    const blameBoost = blames.get(conceptId) ?? 0;
    const cohortNeed = cohortNeeds.has(conceptId) ? 1 : 0;

    const score =
      WEIGHTS.frontier * frontierValue +
      WEIGHTS.uncertainty * uncertainty +
      WEIGHTS.retrievalDue * retrievalDue +
      WEIGHTS.blame * blameBoost +
      WEIGHTS.cohort * cohortNeed;

    return {
      concept_id: conceptId,
      score: round4(score),
      components: { frontierValue, uncertainty, retrievalDue, blameBoost, cohortNeed },
    };
  });

  // deterministic tie-break: score desc, then concept_id asc
  return scored.sort((a, b) => b.score - a.score || a.concept_id.localeCompare(b.concept_id));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
