import type { Observation } from "../contracts/schemas.js";
import type { SignatureCode } from "../contracts/signatures.js";

export type Flag = "rapid_guess" | "idle" | "retry_spam";

/**
 * The enforcement mechanism for the architecture's central rule: a game
 * observes, it never judges. `signature` is a required parameter, not
 * optional -- a game author must pass "UNCLASSIFIED" explicitly rather
 * than omit it, so a missing classification is visible in the code review,
 * not silently defaulted. Latency/attempts/flags are computed here so a
 * game author can't forget them.
 */
export function buildObservation(input: {
  item_id: string;
  concept_id: string;
  difficulty: number;
  response: Observation["response"];
  verdict: "correct" | "incorrect";
  signature: SignatureCode;
  signature_confidence: number;
  startedAtMs: number;
  endedAtMs: number;
  attempts: number;
}): Observation {
  const latency_ms = Math.max(0, input.endedAtMs - input.startedAtMs);
  const flags: Flag[] = [];
  if (latency_ms < 700) flags.push("rapid_guess");
  if (latency_ms > 30_000) flags.push("idle");
  if (input.attempts > 4) flags.push("retry_spam");

  return {
    item_id: input.item_id,
    concept_id: input.concept_id,
    difficulty: input.difficulty,
    response: input.response,
    verdict: input.verdict,
    signature: input.signature,
    signature_confidence: input.signature_confidence,
    latency_ms,
    attempts: input.attempts,
    flags,
  };
}
