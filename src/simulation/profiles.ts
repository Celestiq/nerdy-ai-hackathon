import type { Assignment, EvidenceBundle } from "../contracts/schemas.js";
import type { SignatureCode } from "../contracts/signatures.js";
import { buildObservation } from "../sdk/observation.js";

export interface SimContext {
  rng: () => number;
  simulatedAtMs: number;
  sessionSeq: number;
}

export type LearnerProfile = (assignment: Assignment, ctx: SimContext) => EvidenceBundle;

function randRange(rng: () => number, min: number, max: number): number {
  return Math.round(min + rng() * (max - min));
}

interface RespondOpts {
  /** Either a flat rate, or a per-concept rate for profiles whose accuracy
   * legitimately depends on what's being assessed (e.g. a misconception
   * that only shows up on specific concepts, not on everything served). */
  correctProb: number | ((conceptId: string) => number);
  latencyMs: [number, number];
  signatureWhenWrong: SignatureCode | ((rng: () => number, conceptId: string) => SignatureCode);
  abandonAfterFraction?: number; // e.g. 0.4 => quits after 40% of items
}

function resolveCorrectProb(correctProb: RespondOpts["correctProb"], conceptId: string): number {
  return typeof correctProb === "function" ? correctProb(conceptId) : correctProb;
}

function respond(assignment: Assignment, ctx: SimContext, opts: RespondOpts): EvidenceBundle {
  const startedAt = ctx.simulatedAtMs;
  let t = startedAt;
  const abandonAt =
    opts.abandonAfterFraction !== undefined
      ? Math.max(1, Math.floor(assignment.item_specs.length * opts.abandonAfterFraction))
      : assignment.item_specs.length;

  const observations = [];
  for (let i = 0; i < assignment.item_specs.length && i < abandonAt; i++) {
    const spec = assignment.item_specs[i];
    const latency = randRange(ctx.rng, opts.latencyMs[0], opts.latencyMs[1]);
    const correct = ctx.rng() < resolveCorrectProb(opts.correctProb, spec.concept_id);
    const signature: SignatureCode = correct
      ? "UNCLASSIFIED"
      : typeof opts.signatureWhenWrong === "function"
        ? opts.signatureWhenWrong(ctx.rng, spec.concept_id)
        : opts.signatureWhenWrong;

    const obs = buildObservation({
      item_id: spec.item_id,
      concept_id: spec.concept_id,
      difficulty: spec.difficulty,
      response: { kind: "sim", value: correct ? 1 : 0, target: 1 },
      verdict: correct ? "correct" : "incorrect",
      signature,
      signature_confidence: correct ? 0 : 0.85,
      startedAtMs: t,
      endedAtMs: t + latency,
      attempts: 1,
    });
    observations.push(obs);
    t += latency + 300;
  }

  const abandoned = abandonAt < assignment.item_specs.length;
  return {
    session_id: `ses_sim_${assignment.assignment_id}_${ctx.sessionSeq}`,
    student_id: assignment.student_id,
    assignment_id: assignment.assignment_id,
    game_id: assignment.game_id,
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(t).toISOString(),
    observations,
    engagement: { completed: !abandoned, abandoned_at: abandoned ? new Date(t).toISOString() : null, idle_ms: 0 },
  };
}

/** Masters concepts at a normal rate. correctProb sits comfortably above
 * the mastery threshold (0.85) so a competent learner reliably clears it
 * within the wheel-spin window rather than stalling on Bernoulli noise.
 * (0.97, not 0.93 -- with only ~4 items per session at low-to-moderate
 * difficulty on the graph's two roots, the Beta(1,1) prior plus
 * WHEEL_SPIN_LIMIT=3 leaves razor-thin margin around 0.93: cumulative
 * mastery lands at ~0.84 after exactly 3 sessions, i.e. wheel-spin-blocked
 * one session before crossing 0.85. Verified empirically against the real
 * item banks, not just simulated -- see BACKLOG.md dead-end fix.) */
export const competent: LearnerProfile = (a, ctx) =>
  respond(a, ctx, { correctProb: 0.97, latencyMs: [1500, 4000], signatureWhenWrong: "UNCLASSIFIED" });

export interface MisconceptionOpts {
  /** Concepts where the misconception actually shows up. Outside this set
   * the learner behaves competently (see `competent`'s correctProb) --
   * a child with, say, whole-number bias on fraction comparison should
   * still be able to count and partition normally, not fail everything
   * served regardless of concept. Omit entirely to reproduce the original
   * uniform behaviour (wrong at `targetCorrectProb` on every concept
   * served, whatever it is) for callers that want that. */
  targetConcepts?: string[];
  targetCorrectProb?: number;
  baseCorrectProb?: number;
}

/** Consistently produces one signature when wrong on the target concept(s),
 * succeeds elsewhere. */
export function misconceptionHolder(signature: SignatureCode, opts: MisconceptionOpts = {}): LearnerProfile {
  const { targetConcepts, targetCorrectProb = 0.55, baseCorrectProb = 0.97 } = opts;
  const inTarget = (conceptId: string) => !targetConcepts || targetConcepts.includes(conceptId);
  return (a, ctx) =>
    respond(a, ctx, {
      correctProb: (conceptId) => (inTarget(conceptId) ? targetCorrectProb : baseCorrectProb),
      latencyMs: [2000, 5000],
      signatureWhenWrong: (_rng, conceptId) => (inTarget(conceptId) ? signature : "UNCLASSIFIED"),
    });
}

/** Never masters the target concept regardless of how many items are served. */
export const wheelSpinner: LearnerProfile = (a, ctx) =>
  respond(a, ctx, { correctProb: 0.12, latencyMs: [3000, 6000], signatureWhenWrong: "UNCLASSIFIED" });

/**
 * Wheel-spins (never masters, same rate as `wheelSpinner`) on a specific
 * subset of concepts while remaining competent elsewhere. Use this instead
 * of the uniform `wheelSpinner` when the demo needs to show the stuck/
 * escalation path live on one concept without dead-ending a two-root graph
 * -- a real "some things are hard for this kid" profile, not "nothing ever
 * works for this kid".
 */
export function strugglesOn(targetConcepts: string[], opts: { struggleCorrectProb?: number; baseCorrectProb?: number } = {}): LearnerProfile {
  const { struggleCorrectProb = 0.12, baseCorrectProb = 0.97 } = opts;
  return (a, ctx) =>
    respond(a, ctx, {
      correctProb: (conceptId) => (targetConcepts.includes(conceptId) ? struggleCorrectProb : baseCorrectProb),
      latencyMs: [3000, 6000],
      signatureWhenWrong: "UNCLASSIFIED",
    });
}

/** Sub-second latencies, chance-level accuracy. */
export const rapidGuesser: LearnerProfile = (a, ctx) =>
  respond(a, ctx, { correctProb: 0.5, latencyMs: [150, 650], signatureWhenWrong: "UNCLASSIFIED" });

/** Quits mid-session, leaving partial evidence. */
export const abandoner: LearnerProfile = (a, ctx) =>
  respond(a, ctx, { correctProb: 0.7, latencyMs: [1500, 3500], signatureWhenWrong: "UNCLASSIFIED", abandonAfterFraction: 0.4 });

/**
 * Masters, then (via the store's own time-decay -- see src/store/projector.ts)
 * degrades in belief over simulated weeks without further evidence. The
 * profile itself just performs well; the decay is the projector's job.
 */
export const decayer: LearnerProfile = (a, ctx) =>
  respond(a, ctx, { correctProb: 0.97, latencyMs: [1500, 3500], signatureWhenWrong: "UNCLASSIFIED" });

export const PROFILES = { competent, misconceptionHolder, wheelSpinner, strugglesOn, rapidGuesser, abandoner, decayer };
