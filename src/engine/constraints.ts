import type { ConceptGraph } from "../graph/loader.js";
import type { BeliefInternal } from "../store/types.js";
import type { ScoredCandidate } from "./scoring.js";
import { WHEEL_SPIN_LIMIT } from "../store/types.js";

export interface ConstraintOutcome {
  allowed: ScoredCandidate[];
  blocked: Array<{ concept_id: string; score: number; reason: string }>;
}

const VARIETY_LIMIT = 2;

/**
 * Hard constraint layer -- built before scoring is tuned, and it sits
 * ABOVE scoring: a concept can win on score and still never be served.
 * See architecture.html #engine figure and roadmap.html C6 "Unit --
 * constraints override scoring".
 */
export function applyHardConstraints(
  graph: ConceptGraph,
  belief: Map<string, BeliefInternal>,
  scored: ScoredCandidate[],
): ConstraintOutcome {
  const blocked: ConstraintOutcome["blocked"] = [];
  const survivors: ScoredCandidate[] = [];

  for (const candidate of scored) {
    const b = belief.get(candidate.concept_id);

    if (b && b.attempts_without_mastery >= WHEEL_SPIN_LIMIT) {
      blocked.push({ ...candidate, reason: `wheel-spin block: attempts_without_mastery=${b.attempts_without_mastery} >= ${WHEEL_SPIN_LIMIT}` });
      continue;
    }

    const hardReqs = graph.data.requires.filter((e) => e.from === candidate.concept_id && e.strength === "hard");
    const unmet = hardReqs.filter((e) => (belief.get(e.to)?.p_mastery ?? 0) < (graph.node(e.to)?.mastery_threshold ?? 1));
    if (unmet.length > 0) {
      blocked.push({ ...candidate, reason: `prerequisite gate: unmet hard prerequisite(s) ${unmet.map((e) => e.to).join(", ")}` });
      continue;
    }

    survivors.push(candidate);
  }

  // variety: keep the assignment focused on a small number of concepts per session
  const allowed = survivors.slice(0, VARIETY_LIMIT);
  for (const dropped of survivors.slice(VARIETY_LIMIT)) {
    blocked.push({ ...dropped, reason: `variety: outside top ${VARIETY_LIMIT} concepts for this session` });
  }

  return { allowed, blocked };
}

/** Concepts newly (or still) stuck -- the "needs a human" branch. */
export function stuckEscalations(belief: Map<string, BeliefInternal>): string[] {
  return [...belief.values()].filter((b) => b.attempts_without_mastery >= WHEEL_SPIN_LIMIT).map((b) => b.concept_id);
}
