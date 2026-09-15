import type { EvidenceBundle, Observation } from "../contracts/schemas.js";
import type { BeliefInternal, BeliefStatus, SignatureRecord } from "./types.js";
import {
  DECAY_MARGIN,
  MASTERY_RECENT_MIN_CORRECT,
  MASTERY_RECENT_WINDOW,
  MIN_MASTERY_OBS,
  RECENCY_GRACE_OBS,
  RECENCY_HALF_LIFE_OBS,
  WHEEL_SPIN_LIMIT,
  WHEEL_SPIN_MIN_SESSION_OBS,
  WHEEL_SPIN_SESSION_ACCURACY,
} from "./types.js";

/**
 * The projector never imports the graph module. It receives concept
 * metadata (threshold, decay half-life) through this lookup, supplied by
 * the composition layer. This is the "store holds no pedagogy" rule made
 * structural rather than just documented: swap the mastery model here
 * without ever importing pedagogy, and swap the graph without ever
 * importing student data.
 */
export interface ConceptMeta {
  mastery_threshold: number;
  decay_half_life_days: number;
}
export type ConceptMetaLookup = (conceptId: string) => ConceptMeta | undefined;

const DEFAULT_META: ConceptMeta = { mastery_threshold: 0.85, decay_half_life_days: 28 };

interface TimedObservation extends Observation {
  session_id: string;
  at: string; // bundle.started_at
}

function difficultyWeight(difficulty: number): number {
  return 0.5 + 0.5 * difficulty;
}

/** Retention factor per observation beyond the grace window: older evidence is multiplied by this. */
const RECENCY_STEP = Math.pow(0.5, 1 / RECENCY_HALF_LIFE_OBS);

/**
 * Recency-weighted Beta posterior (see RECENCY_GRACE_OBS and
 * RECENCY_HALF_LIFE_OBS in ./types.ts). An observation with k newer ones on
 * the concept carries its full difficulty weight while k < RECENCY_GRACE_OBS,
 * and 0.5^((k - RECENCY_GRACE_OBS) / RECENCY_HALF_LIFE_OBS) of it after that.
 * The Beta(1,1) prior is never discounted. Incremental form: the newest
 * RECENCY_GRACE_OBS observations sit undiscounted in `window`; each one that
 * ages out joins `correctMass`/`incorrectMass` at full weight, after that
 * older mass has been scaled by RECENCY_STEP. The same accumulator serves both
 * the final p_mastery and the session-by-session replay, so the two can't
 * drift apart.
 */
class RecencyPosterior {
  private correctMass = 0;
  private incorrectMass = 0;
  private readonly window: Array<{ correct: boolean; weight: number }> = [];

  add(o: Observation): void {
    this.window.push({ correct: o.verdict === "correct", weight: difficultyWeight(o.difficulty) });
    if (this.window.length > RECENCY_GRACE_OBS) {
      const aged = this.window.shift()!;
      this.correctMass *= RECENCY_STEP;
      this.incorrectMass *= RECENCY_STEP;
      if (aged.correct) this.correctMass += aged.weight;
      else this.incorrectMass += aged.weight;
    }
  }

  get mean(): number {
    let alpha = 1 + this.correctMass;
    let beta = 1 + this.incorrectMass;
    for (const x of this.window) {
      if (x.correct) alpha += x.weight;
      else beta += x.weight;
    }
    return alpha / (alpha + beta);
  }
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24));
}

/**
 * Full-replay projection: belief state is always computed fresh from the
 * complete evidence log for a student, never mutated incrementally. That
 * makes "rebuild equals incrementally-maintained state" true by
 * construction -- there is no second code path to drift out of sync with
 * this one. See tests/store.test.ts for the property test this enables.
 */
export function project(
  studentId: string,
  bundles: EvidenceBundle[],
  metaOf: ConceptMetaLookup,
  now: Date = new Date(),
): Map<string, BeliefInternal> {
  const byConcept = new Map<string, TimedObservation[]>();

  const sorted = [...bundles].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
  for (const bundle of sorted) {
    for (const obs of bundle.observations) {
      const list = byConcept.get(obs.concept_id) ?? [];
      list.push({ ...obs, session_id: bundle.session_id, at: bundle.started_at });
      byConcept.set(obs.concept_id, list);
    }
  }

  const result = new Map<string, BeliefInternal>();
  for (const [conceptId, observations] of byConcept) {
    const meta = metaOf(conceptId) ?? DEFAULT_META;
    result.set(conceptId, projectConcept(studentId, conceptId, observations, meta, now));
  }
  return result;
}

function projectConcept(
  studentId: string,
  conceptId: string,
  observations: TimedObservation[],
  meta: ConceptMeta,
  now: Date,
): BeliefInternal {
  // --- p_mastery: Beta(1,1) prior, difficulty- and recency-weighted evidence ---
  const posterior = new RecencyPosterior();
  for (const o of observations) posterior.add(o);
  const p_mastery = posterior.mean;

  // --- confidence: count (saturating) x agreement x difficulty spread x recency ---
  const n = observations.length;
  const countFactor = n / (n + 4);

  const verdicts01: number[] = observations.map((o) => (o.verdict === "correct" ? 1 : 0));
  const meanV = verdicts01.reduce((a, b) => a + b, 0) / n;
  const varianceV = verdicts01.reduce((a, v) => a + (v - meanV) ** 2, 0) / n;
  const agreement = 1 - Math.min(1, varianceV * 4); // variance maxes at .25 for a binary series

  const buckets = new Set(observations.map((o) => Math.round(o.difficulty * 4) / 4));
  const spread = Math.min(1, buckets.size / 3);

  const nowIso = now.toISOString();
  const recencyFactors = observations.map((o) => Math.pow(0.5, daysBetween(o.at, nowIso) / 60));
  const recency = recencyFactors.reduce((a, b) => a + b, 0) / n;

  const confidence = clamp01(countFactor * (0.4 + 0.3 * agreement + 0.3 * spread) * recency);

  // --- last_observed / p_decayed ---
  const lastObservedIso = observations.reduce((latest, o) => (o.at > latest ? o.at : latest), observations[0].at);
  const daysSince = daysBetween(lastObservedIso, nowIso);
  const p_decayed = decayToward(p_mastery, daysSince, meta);

  // --- signatures ---
  const sigMap = new Map<string, { count: number; last_seen: string }>();
  for (const o of observations) {
    if (o.signature === "UNCLASSIFIED") continue;
    const entry = sigMap.get(o.signature) ?? { count: 0, last_seen: o.at };
    entry.count += 1;
    if (o.at > entry.last_seen) entry.last_seen = o.at;
    sigMap.set(o.signature, entry);
  }
  const signatures: SignatureRecord[] = [...sigMap.entries()].map(([code, v]) => ({
    code,
    count: v.count,
    strength: Math.min(1, v.count / 3),
    last_seen: v.last_seen.slice(0, 10),
  }));

  // --- attempts_without_mastery: replay session-by-session ---
  const bySession = new Map<string, TimedObservation[]>();
  for (const o of observations) {
    const list = bySession.get(o.session_id) ?? [];
    list.push(o);
    bySession.set(o.session_id, list);
  }
  const sessionOrder = [...bySession.entries()].sort(
    (a, b) => new Date(a[1][0].at).getTime() - new Date(b[1][0].at).getTime(),
  );
  // The evidence floor is evaluated over the same chronological replay order
  // (bundle.started_at, then in-bundle order) as everything else here --
  // `replayed` accumulates observations in exactly that order.
  const running = new RecencyPosterior();
  let attempts_without_mastery = 0;
  const replayed: TimedObservation[] = [];
  let obsSinceStuck = 0;
  // Whether the concept currently holds MASTERED in the replay (earned the
  // full bar and hasn't since left via DECAY_MARGIN hysteresis). Derived
  // purely from replay, not stored.
  let mastered = false;
  let lastSessionAt: string | null = null;
  for (const [, sessionObs] of sessionOrder) {
    const wasStuck = attempts_without_mastery >= WHEEL_SPIN_LIMIT;
    const sessionAt = sessionObs[0].at;
    // Decay across the gap since the previous session: if the concept had
    // already faded to DECAYED before this session began, it has left
    // mastery and must re-earn the full bar.
    if (mastered && lastSessionAt !== null) {
      const gapDecayed = decayToward(running.mean, daysBetween(lastSessionAt, sessionAt), meta);
      if (gapDecayed < meta.mastery_threshold - DECAY_MARGIN) mastered = false;
    }
    lastSessionAt = sessionAt;
    for (const o of sessionObs) {
      running.add(o);
      replayed.push(o);
      obsSinceStuck += 1;
    }
    const runningMastery = running.mean;
    const freshSupport = !wasStuck || obsSinceStuck >= MASTERY_RECENT_WINDOW;
    // Reset / Increment / Hold. A session that doesn't meet the mastery bar
    // only counts as a wheel-spin if the child actually struggled in it: a
    // short, easy, all-correct session can leave running mastery below the
    // threshold, and that is not evidence of being stuck. Such a session
    // holds the counter (neither resets an escalation nor adds to it).
    const sessionCorrect = sessionObs.filter((o) => o.verdict === "correct").length;
    const sessionAccuracy = sessionCorrect / sessionObs.length;
    const floorMet = meetsMasteryFloor(replayed);
    if (runningMastery >= meta.mastery_threshold && floorMet && freshSupport) {
      mastered = true;
    } else if (mastered && (floorMet || runningMastery >= meta.mastery_threshold - DECAY_MARGIN)) {
      // Hysteresis: already MASTERED, and this session is not genuine
      // counter-evidence (needs BOTH a failed floor and p below the band).
    } else {
      mastered = false;
    }
    if (mastered) {
      attempts_without_mastery = 0;
    } else if (
      sessionAccuracy < WHEEL_SPIN_SESSION_ACCURACY &&
      // A 1-of-2 slip is not wheel-spinning: too few in-session obs Holds.
      sessionObs.length >= WHEEL_SPIN_MIN_SESSION_OBS
    ) {
      attempts_without_mastery += 1;
    }
    // Entering STUCK restarts the fresh-evidence count: only
    // observations from sessions after this one can clear the escalation.
    if (attempts_without_mastery >= WHEEL_SPIN_LIMIT && !wasStuck) obsSinceStuck = 0;
  }

  const status = deriveStatus(n, p_decayed, attempts_without_mastery, mastered, meta);

  return {
    student_id: studentId,
    concept_id: conceptId,
    p_mastery,
    confidence,
    observations_n: n,
    last_observed: lastObservedIso.slice(0, 10),
    p_decayed,
    signatures,
    attempts_without_mastery,
    status,
  };
}

/**
 * Evidence floor for MASTERED (see MIN_MASTERY_OBS in ./types.ts): enough
 * observations overall, and the most recent window mostly correct.
 * `chronological` must already be in replay order.
 */
function meetsMasteryFloor(chronological: readonly Observation[]): boolean {
  if (chronological.length < MIN_MASTERY_OBS) return false;
  const recent = chronological.slice(-MASTERY_RECENT_WINDOW);
  const correct = recent.filter((o) => o.verdict === "correct").length;
  return correct >= MASTERY_RECENT_MIN_CORRECT;
}

/** Ages a mastery estimate toward the 0.5 prior by the concept's half-life. */
function decayToward(p: number, days: number, meta: ConceptMeta): number {
  return clamp01(0.5 + (p - 0.5) * Math.pow(0.5, days / meta.decay_half_life_days));
}

/**
 * `mastered` is the replay's hysteresis state after the last session (see
 * DECAY_MARGIN in ./types.ts): entering it needs the full bar, leaving it
 * needs genuine counter-evidence, and decay flips it to DECAYED only once
 * p_decayed falls below threshold - DECAY_MARGIN.
 */
function deriveStatus(
  n: number,
  p_decayed: number,
  attempts_without_mastery: number,
  mastered: boolean,
  meta: ConceptMeta,
): BeliefStatus {
  if (n === 0) return "UNTESTED";
  if (attempts_without_mastery >= WHEEL_SPIN_LIMIT) return "STUCK";
  if (mastered) {
    return p_decayed >= meta.mastery_threshold - DECAY_MARGIN ? "MASTERED" : "DECAYED";
  }
  return "EMERGING";
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
