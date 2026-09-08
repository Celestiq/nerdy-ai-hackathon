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
  correctProb: number;
  latencyMs: [number, number];
  signatureWhenWrong: SignatureCode | ((rng: () => number) => SignatureCode);
  abandonAfterFraction?: number; // e.g. 0.4 => quits after 40% of items
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
    const correct = ctx.rng() < opts.correctProb;
    const signature: SignatureCode = correct
      ? "UNCLASSIFIED"
      : typeof opts.signatureWhenWrong === "function"
        ? opts.signatureWhenWrong(ctx.rng)
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
 * within the wheel-spin window rather than stalling on Bernoulli noise. */
export const competent: LearnerProfile = (a, ctx) =>
  respond(a, ctx, { correctProb: 0.93, latencyMs: [1500, 4000], signatureWhenWrong: "UNCLASSIFIED" });

/** Consistently produces one signature when wrong, succeeds elsewhere. */
export function misconceptionHolder(signature: SignatureCode): LearnerProfile {
  return (a, ctx) => respond(a, ctx, { correctProb: 0.55, latencyMs: [2000, 5000], signatureWhenWrong: signature });
}

/** Never masters the target concept regardless of how many items are served. */
export const wheelSpinner: LearnerProfile = (a, ctx) =>
  respond(a, ctx, { correctProb: 0.12, latencyMs: [3000, 6000], signatureWhenWrong: "UNCLASSIFIED" });

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
  respond(a, ctx, { correctProb: 0.93, latencyMs: [1500, 3500], signatureWhenWrong: "UNCLASSIFIED" });

export const PROFILES = { competent, misconceptionHolder, wheelSpinner, rapidGuesser, abandoner, decayer };
