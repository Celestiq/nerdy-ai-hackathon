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
