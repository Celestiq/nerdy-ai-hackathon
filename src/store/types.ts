export interface SignatureRecord {
  code: string;
  count: number;
  strength: number;
  last_seen: string;
}

export type BeliefStatus = "UNTESTED" | "EMERGING" | "MASTERED" | "DECAYED" | "STUCK";

/**
 * Internal projection. The public Belief State contract (src/contracts) is
 * this shape plus graph-resolved `blames` on each signature, joined in at
 * the composition layer (server/state.ts) -- the store itself holds no
 * pedagogy and never calls into the graph.
 */
export interface BeliefInternal {
  student_id: string;
  concept_id: string;
  p_mastery: number;
  confidence: number;
  observations_n: number;
  last_observed: string | null;
  p_decayed: number;
  signatures: SignatureRecord[];
  attempts_without_mastery: number;
  status: BeliefStatus;
}

export const WHEEL_SPIN_LIMIT = 3;

/**
 * Mastery evidence floor. p_mastery >= threshold alone is not enough to call
 * a concept MASTERED (or DECAYED) or to reset attempts_without_mastery:
 *  - at least MIN_MASTERY_OBS observations on the concept in total, and
 *  - of the most recent MASTERY_RECENT_WINDOW observations (replay order),
 *    at least MASTERY_RECENT_MIN_CORRECT are correct, and
 *  - if the concept was already STUCK going into a session, that recent
 *    window must consist entirely of observations made after it got stuck,
 *    so one lucky answer can't clear an escalation.
 */
export const MIN_MASTERY_OBS = 4;
export const MASTERY_RECENT_WINDOW = 3;
export const MASTERY_RECENT_MIN_CORRECT = 2;
