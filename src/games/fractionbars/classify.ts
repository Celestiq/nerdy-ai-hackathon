import type { SignatureCode } from "../../contracts/signatures.js";
import type { FractionbarsItem } from "./items.js";

export interface ClassifyResult {
  verdict: "correct" | "incorrect";
  signature: SignatureCode;
  signature_confidence: number;
}

/**
 * Signature-by-construction for a two-alternative forced choice: the wrong
 * answer's *shape* (bigger numerator vs bigger denominator than the
 * correct choice) is the diagnosis, not an inference about intent.
 */
export function classifyChoice(item: FractionbarsItem, choice: "a" | "b"): ClassifyResult {
  if (choice === item.correct) {
    return { verdict: "correct", signature: "UNCLASSIFIED", signature_confidence: 0 };
  }
  const chosen = item[choice];
  const correctFrac = item[item.correct];

  if (chosen.numerator > correctFrac.numerator) {
    return { verdict: "incorrect", signature: "WHOLE_NUMBER_BIAS", signature_confidence: 0.75 };
  }
  if (chosen.denominator > correctFrac.denominator) {
    return { verdict: "incorrect", signature: "DENOMINATOR_BIAS", signature_confidence: 0.75 };
  }
  return { verdict: "incorrect", signature: "UNCLASSIFIED", signature_confidence: 0.3 };
}
