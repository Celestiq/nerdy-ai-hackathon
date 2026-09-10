import type { SignatureCode } from "../../contracts/signatures.js";
import type { BalanceScaleItem } from "./items.js";

export interface ClassifyResult {
  verdict: "correct" | "incorrect";
  signature: SignatureCode;
  signature_confidence: number;
}

/**
 * F.EQV ("Equivalent fractions") is an EQUIVALENCE judgement, not a
 * magnitude comparison -- "do these two pans hold the same amount?", not
 * "which pan is heavier?". So the diagnosis here is derived structurally
 * from the two pans' actual values (cross-multiplied, not eyeballed
 * decimals), not from a "chosen side vs correct side" shape heuristic --
 * that heuristic (bigger numerator/denominator than the correct choice)
 * belongs to fractionbars' classifyChoice, which is answering a genuinely
 * different question (which fraction is bigger) and produces
 * WHOLE_NUMBER_BIAS/DENOMINATOR_BIAS, codes with no wired `explains` edge
 * on F.EQV in strand-magnitude-fractions.json (`blame(graph, "F.EQV",
 * "WHOLE_NUMBER_BIAS")` returns `[]`) -- reusing them here would have been
 * a dead-end signature the tutor-facing suspects list could never surface.
 *
 * The only signature wired to F.EQV is `LANDMARK_ONLY -> F.MAG.NONUNIT`, and
 * the two wrong-answer directions on this task are NOT the same
 * misconception, so they don't both get it:
 *
 * - Calling a genuinely-EQUAL pair "doesn't balance" fits LANDMARK_ONLY: the
 *   child is anchoring to a surface cue (the numerator/denominator digits
 *   look different, e.g. 1/2 vs 2/4) instead of computing each fraction's
 *   actual magnitude -- exactly what LANDMARK_ONLY names, and the direction
 *   this codebase's one wired `explains` edge was authored for.
 * - Calling a genuinely-UNEQUAL pair "balances" is a different error shape:
 *   under-attending to a real magnitude difference, not over-attending to a
 *   surface cue. Nothing in this codebase's signature set names that shape
 *   yet, so forcing LANDMARK_ONLY onto it would misdiagnose the child (and,
 *   via blame(), point the tutor at the wrong remediation). This emits
 *   UNCLASSIFIED@0 instead -- the same "no confident signature" discipline
 *   classifyPartition uses in fractionbars/classify.ts for genuinely
 *   ambiguous wrong answers -- rather than inventing an unwired code.
 */
export function classifyTip(item: BalanceScaleItem, choice: "balances" | "doesnt_balance"): ClassifyResult {
  const trulyBalances = item.left.numerator * item.right.denominator === item.right.numerator * item.left.denominator;
  const correctChoice: "balances" | "doesnt_balance" = trulyBalances ? "balances" : "doesnt_balance";

  if (choice === correctChoice) {
    return { verdict: "correct", signature: "UNCLASSIFIED", signature_confidence: 0 };
  }

  // Truly equal, called "doesn't balance": over-attending to a surface cue.
  if (trulyBalances) {
    return { verdict: "incorrect", signature: "LANDMARK_ONLY", signature_confidence: 0.7 };
  }
  // Truly unequal, called "balances": under-attending to a real magnitude
  // difference -- a different, currently-unwired error shape.
  return { verdict: "incorrect", signature: "UNCLASSIFIED", signature_confidence: 0 };
}
