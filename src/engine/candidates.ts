import type { ConceptGraph } from "../graph/loader.js";
import { frontier, type BeliefLookup } from "../graph/query.js";
import type { BeliefInternal } from "../store/types.js";
import type { GameRegistry, ItemBankRegistry } from "../registry/index.js";

/** Concepts with no hard prerequisite at all -- the only safe start for a child with zero history. */
export function rootConcepts(graph: ConceptGraph): string[] {
  const hasHardReq = new Set(graph.data.requires.filter((e) => e.strength === "hard").map((e) => e.from));
  return [...graph.nodes.keys()].filter((id) => !hasHardReq.has(id));
}

/**
 * Candidate generation: frontier + retrieval-due + (implicitly) unmeasured,
 * since an unmeasured concept with met prerequisites is already on the
 * frontier. See architecture.html #engine step 1.
 *
 * Deliberately does NOT exclude STUCK concepts here -- they must survive
 * into scoring so the hard-constraint layer is the thing that blocks them.
 * See roadmap.html C6 "constraints override scoring".
 */
export function candidateConcepts(graph: ConceptGraph, belief: Map<string, BeliefInternal>): string[] {
  const lookup: BeliefLookup = (id) => belief.get(id);
  const front = frontier(graph, lookup);
  const due = [...belief.values()].filter((b) => b.status === "DECAYED").map((b) => b.concept_id);
  return [...new Set([...front, ...due])];
}

/**
 * Cold-start policy, made explicit rather than left to fall out of scoring
 * by accident (roadmap.html #risks "Cold start"). A child with no evidence
 * at all is restricted to concepts with no hard prerequisite.
 */
export function isColdStart(belief: Map<string, BeliefInternal>): boolean {
  return belief.size === 0 || [...belief.values()].every((b) => b.observations_n === 0);
}

/**
 * "Covered" means more than a manifest capability match -- it means a
 * registered game's item bank actually holds authored content for this
 * concept right now. A concept can be legitimately in the graph, matched
 * by a manifest's declared representations/task types, and still have
 * nothing to serve (roadmap.html C5 "uncovered-concepts report"). Treating
 * capability-match alone as coverage lets the engine pick a concept with
 * zero items and fail assembly outright, so this is the check candidate
 * generation actually needs.
 */
export function isCovered(graph: ConceptGraph, registry: GameRegistry, itemBank: ItemBankRegistry, conceptId: string): boolean {
  return registry.matchConcept(graph, conceptId).some((m) => itemBank.itemsForConcepts(m.game_id, [conceptId]).length > 0);
}
