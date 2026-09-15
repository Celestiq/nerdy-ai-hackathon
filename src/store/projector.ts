import type { EvidenceBundle, Observation } from "../contracts/schemas.js";
import type { BeliefInternal, BeliefStatus, SignatureRecord } from "./types.js";
import { MASTERY_RECENT_MIN_CORRECT, MASTERY_RECENT_WINDOW, MIN_MASTERY_OBS, WHEEL_SPIN_LIMIT } from "./types.js";

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
  // --- p_mastery: Beta(1,1) prior, difficulty-weighted evidence ---
  let alpha = 1;
  let beta = 1;
  for (const o of observations) {
    const w = difficultyWeight(o.difficulty);
    if (o.verdict === "correct") alpha += w;
    else beta += w;
  }
  const p_mastery = alpha / (alpha + beta);

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
  const p_decayed = clamp01(0.5 + (p_mastery - 0.5) * Math.pow(0.5, daysSince / meta.decay_half_life_days));

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
  let runAlpha = 1;
  let runBeta = 1;
  let attempts_without_mastery = 0;
  const replayed: TimedObservation[] = [];
  let obsSinceStuck = 0;
  for (const [, sessionObs] of sessionOrder) {
    const wasStuck = attempts_without_mastery >= WHEEL_SPIN_LIMIT;
    for (const o of sessionObs) {
      const w = difficultyWeight(o.difficulty);
      if (o.verdict === "correct") runAlpha += w;
      else runBeta += w;
      replayed.push(o);
      obsSinceStuck += 1;
    }
    const runningMastery = runAlpha / (runAlpha + runBeta);
    const freshSupport = !wasStuck || obsSinceStuck >= MASTERY_RECENT_WINDOW;
    if (runningMastery >= meta.mastery_threshold && meetsMasteryFloor(replayed) && freshSupport) {
      attempts_without_mastery = 0;
    } else {
      attempts_without_mastery += 1;
    }
    // Entering STUCK restarts the fresh-evidence count: only
    // observations from sessions after this one can clear the escalation.
    if (attempts_without_mastery >= WHEEL_SPIN_LIMIT && !wasStuck) obsSinceStuck = 0;
  }

  const status = deriveStatus(n, p_mastery, p_decayed, attempts_without_mastery, meetsMasteryFloor(replayed), meta);

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

function deriveStatus(
  n: number,
  p_mastery: number,
  p_decayed: number,
  attempts_without_mastery: number,
  floorMet: boolean,
  meta: ConceptMeta,
): BeliefStatus {
  if (n === 0) return "UNTESTED";
  if (attempts_without_mastery >= WHEEL_SPIN_LIMIT) return "STUCK";
  if (p_mastery >= meta.mastery_threshold && floorMet) {
    return p_decayed >= meta.mastery_threshold ? "MASTERED" : "DECAYED";
  }
  return "EMERGING";
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
