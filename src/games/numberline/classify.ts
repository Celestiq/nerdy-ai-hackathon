import type { SignatureCode } from "../../contracts/signatures.js";
import type { NumberlineItem } from "./items.js";

export interface ClassifyResult {
  verdict: "correct" | "incorrect";
  signature: SignatureCode;
  signature_confidence: number;
}

/**
 * Signature-by-construction: every item declares, in advance, which
 * response regions correspond to which named misconception. This function
 * is total (every coordinate in [0,1] produces exactly one result) and
 * deterministic -- no model is asked to interpret the child's placement.
 * See architecture.html #games "Where the signature comes from".
 *
 * Claims are checked in authored order; the first match wins. That keeps
 * the function total even when two authored bands geometrically overlap.
 */
export function classifyPlacement(item: NumberlineItem, responseValue: number): ClassifyResult {
  const r = clamp01(responseValue);

  if (Math.abs(r - item.target) <= item.tolerance) {
    return { verdict: "correct", signature: "UNCLASSIFIED", signature_confidence: 0 };
  }

  for (const claim of item.claims) {
    const dist = Math.abs(r - claim.at);
    if (dist <= claim.width) {
      const confidence = 0.6 + 0.35 * (1 - dist / claim.width);
      return { verdict: "incorrect", signature: claim.signature, signature_confidence: round2(confidence) };
    }
  }

  return { verdict: "incorrect", signature: "UNCLASSIFIED", signature_confidence: 0.3 };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
