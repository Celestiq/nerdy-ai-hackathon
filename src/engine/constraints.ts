import type { ConceptGraph } from "../graph/loader.js";
import type { BeliefInternal } from "../store/types.js";
import type { ScoredCandidate } from "./scoring.js";
import { WHEEL_SPIN_LIMIT } from "../store/types.js";
import { hashInt } from "./hash.js";

export interface ConstraintOutcome {
  allowed: ScoredCandidate[];
  blocked: Array<{ concept_id: string; score: number; reason: string }>;
  /** concept_id of the candidate whose wheel-spin block was relaxed by the
   * starvation fallback below, if any -- lets the engine log it distinctly
   * from an ordinary "selected" reason. */
  relaxed?: string;
}

const VARIETY_LIMIT = 2;

/** Belief statuses that satisfy a hard prerequisite. Status, not raw
 * p_mastery: p over threshold alone is not mastery (the store's recent-
 * evidence gate must also hold), and a MASTERED concept inside its
 * hysteresis margin is still mastered. DECAYED counts -- a fading
 * prerequisite is a retrieval need, not a reason to lock its successors. */
const PREREQ_SATISFIED: ReadonlySet<BeliefInternal["status"]> = new Set(["MASTERED", "DECAYED"]);

/** Hard prerequisite edges of `conceptId` that are NOT satisfied right now. */
export function unmetHardPrereqs(graph: ConceptGraph, belief: ReadonlyMap<string, BeliefInternal>, conceptId: string): string[] {
  return graph.data.requires
    .filter((e) => e.from === conceptId && e.strength === "hard")
    .filter((e) => !PREREQ_SATISFIED.has(belief.get(e.to)?.status ?? "UNTESTED"))
    .map((e) => e.to);
}

/**
 * The single prerequisite predicate: are all of `conceptId`'s hard
 * prerequisites MASTERED or DECAYED for this child? Used by the normal gate
 * and the starvation fallback below (so the fallback never drifts from the
 * real gate), and exported so the child map's `next` eligibility can use the
 * exact same rule instead of re-deriving it (Cycle 19 lane G/R).
 */
export function prereqsMet(graph: ConceptGraph, belief: ReadonlyMap<string, BeliefInternal>, conceptId: string): boolean {
  return unmetHardPrereqs(graph, belief, conceptId).length === 0;
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
  seed: string,
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

    const unmet = unmetHardPrereqs(graph, belief, candidate.concept_id);
    if (unmet.length > 0) {
      blocked.push({ ...candidate, reason: `prerequisite gate: unmet hard prerequisite(s) ${unmet.join(", ")}` });
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
  // Rotation (Cycle 14 gap #2 fix; re-fixed Cycle 16 -- see below): picking
  // highest-score-then-longest-blocked every time meant a student
  // wheel-spin-blocked on 2+ concepts got the *same* one relaxed every
  // single round -- live-verified 12/12 consecutive sessions for stu_devon,
  // a treadmill rather than a rotation. The first fix preferred whichever
  // eligible candidate was served *least recently* using `last_observed`,
  // but that field is date-truncated by the belief projector
  // (src/store/projector.ts, e.g. "2026-09-10", no time-of-day) -- any two
  // candidates touched "today" (the normal case within one demo/server
  // session) tied on it and fell straight through to the same score-based
  // sort as before the fix, a provable no-op live-verified to repeat the
  // same relaxed concept 5-7 sessions running. Fixed for real by using a
  // deterministic hash of `seed + conceptId` (the same `hashInt` used for
  // item rotation in assemble.ts) as the PRIMARY sort key: each round's
  // `seed` already varies per call (production seed is
  // `srv:${studentId}:${sessionCounter}`, incrementing every API call), so
  // each eligible candidate gets a roughly-uniform independent shot at
  // winning per round, without depending on wall-clock or persisted state
  // at all. Score and attempts_without_mastery remain as secondary
  // tiebreakers, only reachable when the hash itself ties (rare).
  let relaxed: string | undefined;
  if (survivors.length === 0 && wheelSpinBlocked.length > 0) {
    const eligible = wheelSpinBlocked.filter(({ candidate }) => prereqsMet(graph, belief, candidate.concept_id));
    if (eligible.length > 0) {
      const rotationKey = (conceptId: string): number => hashInt(`${seed}:${conceptId}`);
      eligible.sort(
        (a, b) =>
          rotationKey(a.candidate.concept_id) - rotationKey(b.candidate.concept_id) ||
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
