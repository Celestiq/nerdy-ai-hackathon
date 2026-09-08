import type { Assignment, EvidenceBundle } from "../contracts/schemas.js";
import { buildObservation } from "./observation.js";
import type { SignatureCode } from "../contracts/signatures.js";

/**
 * Emits a hand-authored Evidence Bundle for a given Assignment, with no
 * real game underneath. Lets the store, projector and engine be developed
 * and tested against known inputs before a single real game exists.
 * See roadmap.html C0/"Null game".
 */
export function runNullGame(
  assignment: Assignment,
  opts: { correctRate?: number; signatureWhenWrong?: SignatureCode } = {},
): EvidenceBundle {
  const correctRate = opts.correctRate ?? 0.6;
  const signature = opts.signatureWhenWrong ?? "UNCLASSIFIED";

  const startedAt = Date.now();
  let t = startedAt;
  const observations = assignment.item_specs.map((spec, i) => {
    const correct = (i + 1) / assignment.item_specs.length <= correctRate;
    const obs = buildObservation({
      item_id: spec.item_id,
      concept_id: spec.concept_id,
      difficulty: spec.difficulty,
      response: { kind: "null", value: correct ? 1 : 0, target: 1 },
      verdict: correct ? "correct" : "incorrect",
      signature: correct ? "UNCLASSIFIED" : signature,
      signature_confidence: correct ? 0 : 0.85,
      startedAtMs: t,
      endedAtMs: t + 2000,
      attempts: 1,
    });
    t += 2000;
    return obs;
  });

  return {
    session_id: `ses_null_${assignment.assignment_id}`,
    student_id: assignment.student_id,
    assignment_id: assignment.assignment_id,
    game_id: assignment.game_id,
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(t).toISOString(),
    observations,
    engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
  };
}
