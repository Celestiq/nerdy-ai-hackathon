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
 * The only signature wired to F.EQV is `LANDMARK_ONLY -> F.MAG.NONUNIT`.
 * Both wrong-answer directions on this task -- claiming a genuinely-equal
 * pair "doesn't balance", or claiming a genuinely-unequal pair "balances"
 * -- are the same underlying misconception surface: judging the pans by a
 * surface landmark cue (how the numbers look, e.g. "different numerator
 * and denominator so it must be different") rather than actually
 * evaluating each fraction's magnitude and comparing those. That's exactly
 * what LANDMARK_ONLY names, so both directions emit it rather than one of
 * them getting an invented, unwired code.
 */
export function classifyTip(item: BalanceScaleItem, choice: "balances" | "doesnt_balance"): ClassifyResult {
  const trulyBalances = item.left.numerator * item.right.denominator === item.right.numerator * item.left.denominator;
  const correctChoice: "balances" | "doesnt_balance" = trulyBalances ? "balances" : "doesnt_balance";

  if (choice === correctChoice) {
    return { verdict: "correct", signature: "UNCLASSIFIED", signature_confidence: 0 };
  }
  return { verdict: "incorrect", signature: "LANDMARK_ONLY", signature_confidence: 0.7 };
}
