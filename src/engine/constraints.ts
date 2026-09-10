import type { ConceptGraph } from "../graph/loader.js";
import type { BeliefInternal } from "../store/types.js";
import type { ScoredCandidate } from "./scoring.js";
import { WHEEL_SPIN_LIMIT } from "../store/types.js";

export interface ConstraintOutcome {
  allowed: ScoredCandidate[];
  blocked: Array<{ concept_id: string; score: number; reason: string }>;
  /** concept_id of the candidate whose wheel-spin block was relaxed by the
   * starvation fallback below, if any -- lets the engine log it distinctly
   * from an ordinary "selected" reason. */
  relaxed?: string;
}

const VARIETY_LIMIT = 2;

/** Would this candidate's hard prerequisites be satisfied right now? Shared
 * by the normal pass and the starvation fallback below so the fallback
 * never has to re-derive or drift from the real gate logic. */
function prereqsMet(graph: ConceptGraph, belief: Map<string, BeliefInternal>, conceptId: string): boolean {
  const hardReqs = graph.data.requires.filter((e) => e.from === conceptId && e.strength === "hard");
  return hardReqs.every((e) => (belief.get(e.to)?.p_mastery ?? 0) >= (graph.node(e.to)?.mastery_threshold ?? 1));
}

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
  const wheelSpinBlocked: Array<{ candidate: ScoredCandidate; attempts: number }> = [];

  for (const candidate of scored) {
    const b = belief.get(candidate.concept_id);

    if (b && b.attempts_without_mastery >= WHEEL_SPIN_LIMIT) {
      blocked.push({ ...candidate, reason: `wheel-spin block: attempts_without_mastery=${b.attempts_without_mastery} >= ${WHEEL_SPIN_LIMIT}` });
      wheelSpinBlocked.push({ candidate, attempts: b.attempts_without_mastery });
      continue;
    }

    if (!prereqsMet(graph, belief, candidate.concept_id)) {
      const hardReqs = graph.data.requires.filter((e) => e.from === candidate.concept_id && e.strength === "hard");
      const unmet = hardReqs.filter((e) => (belief.get(e.to)?.p_mastery ?? 0) < (graph.node(e.to)?.mastery_threshold ?? 1));
      blocked.push({ ...candidate, reason: `prerequisite gate: unmet hard prerequisite(s) ${unmet.map((e) => e.to).join(", ")}` });
      continue;
    }

    survivors.push(candidate);
  }

  // Starvation fallback: if the normal pass survives nothing, but at least
  // one candidate was blocked purely by the wheel-spin rule (not the
  // prerequisite gate, which we never relax), relax the wheel-spin block
  // for exactly one candidate so a session never dead-ends with literally
  // nothing to try -- see BACKLOG.md's dead-end bug (5 of 7 simulated
  // personas starved continuously from round 6 onward before this).
  //
  // Rotation (Cycle 14 gap #2 fix): picking highest-score-then-longest-
  // blocked every time meant a student wheel-spin-blocked on 2+ concepts
  // got the *same* one relaxed every single round -- live-verified 12/12
  // consecutive sessions for stu_devon, a treadmill rather than a
  // rotation. Fixed by preferring whichever eligible candidate was served
  // *least recently* first (using `last_observed`, already computed by the
  // belief projector -- no new persisted state needed: while a concept
  // stays wheel-spin-blocked, this fallback is the only path that can ever
  // re-serve it, so its `last_observed` already tracks "last time this
  // concept's block was relaxed"). Score is now only a tiebreaker among
  // candidates relaxed equally-long-ago (or never), and
  // attempts_without_mastery breaks any remaining tie.
  let relaxed: string | undefined;
  if (survivors.length === 0 && wheelSpinBlocked.length > 0) {
    const eligible = wheelSpinBlocked.filter(({ candidate }) => prereqsMet(graph, belief, candidate.concept_id));
    if (eligible.length > 0) {
      const lastObservedMs = (conceptId: string): number => {
        const iso = belief.get(conceptId)?.last_observed;
        return iso ? new Date(iso).getTime() : -Infinity; // never observed sorts first
      };
      eligible.sort(
        (a, b) =>
          lastObservedMs(a.candidate.concept_id) - lastObservedMs(b.candidate.concept_id) ||
          b.candidate.score - a.candidate.score ||
          b.attempts - a.attempts,
      );
      const winner = eligible[0].candidate;
      const idx = blocked.findIndex((b) => b.concept_id === winner.concept_id);
      if (idx !== -1) blocked.splice(idx, 1);
      survivors.push(winner);
      relaxed = winner.concept_id;
    }
  }

  // variety: keep the assignment focused on a small number of concepts per session
  const allowed = survivors.slice(0, VARIETY_LIMIT);
  for (const dropped of survivors.slice(VARIETY_LIMIT)) {
    blocked.push({ ...dropped, reason: `variety: outside top ${VARIETY_LIMIT} concepts for this session` });
  }

  return { allowed, blocked, relaxed };
}

/** Concepts newly (or still) stuck -- the "needs a human" branch. */
export function stuckEscalations(belief: Map<string, BeliefInternal>): string[] {
  return [...belief.values()].filter((b) => b.attempts_without_mastery >= WHEEL_SPIN_LIMIT).map((b) => b.concept_id);
}
