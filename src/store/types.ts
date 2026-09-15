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
 * Wheel-spin counter rule, per session on a concept (replay order):
 *  - Reset to 0 if the session leaves the concept MASTERED (running p_mastery
 *    >= threshold plus the evidence floor below, or already MASTERED and
 *    still inside the DECAY_MARGIN hysteresis band);
 *  - otherwise Increment only if that session's own raw accuracy on the
 *    concept is below WHEEL_SPIN_SESSION_ACCURACY, over at least
 *    WHEEL_SPIN_MIN_SESSION_OBS observations;
 *  - otherwise Hold (unchanged). Accurate-but-short sessions that haven't
 *    yet accumulated enough evidence to clear the bar must not escalate a
 *    child to STUCK.
 */
export const WHEEL_SPIN_SESSION_ACCURACY = 0.8;

/**
 * ...and Increment additionally requires at least this many observations on
 * the concept in that one session. A 1-of-2 slip is 50% "accuracy" but is not
 * evidence of wheel-spinning; below this count the session Holds.
 */
export const WHEEL_SPIN_MIN_SESSION_OBS = 3;

/**
 * Hysteresis band below a concept's mastery_threshold. Once a concept has
 * earned MASTERED (p_mastery >= threshold plus the evidence floor), it only
 * leaves on evidence that clears this band, so a concept sitting near the
 * threshold doesn't flicker bloom -> glow -> bloom (and re-fire the mastery
 * beat) on noise:
 *  - Counter-evidence exit: at a session boundary, the evidence floor fails
 *    (<= 1 correct in the last MASTERY_RECENT_WINDOW) AND running p_mastery
 *    < threshold - DECAY_MARGIN. Either alone is not enough.
 *  - Decay: MASTERED -> DECAYED only when p_decayed < threshold - DECAY_MARGIN.
 *    A decayed concept has left mastery; getting back needs the full bar
 *    (p_mastery >= threshold plus the floor) again.
 *
 * 0.15: with the graph's 0.85 thresholds the exit line is 0.70. A concept
 * mastered at p ~= 0.9 then fades once it has lost half its lead over the
 * 0.5 prior -- exactly one of its own half-lives (28-45 days), ~0.8 of one at
 * p ~= 0.853 -- instead of within hours of mastery, which is a defensible
 * spaced-retrieval interval. 0.70 is still well clear of the prior, so the
 * counter-evidence exit stays meaningful. 0.10 (exit at 0.75) was measured
 * and left 0/6 seeded kids with >= 2 MASTERED concepts (vs 4/6 at 0.15).
 */
export const DECAY_MARGIN = 0.15;

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
