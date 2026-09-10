import { describe, it, expect } from "vitest";
import { classifyTip } from "../src/games/balancescale/classify.js";
import { balancescaleItems } from "../src/games/balancescale/items.js";

/**
 * Direct unit coverage for classifyTip()'s asymmetric wrong-answer
 * diagnosis (see the file's own doc comment for the pedagogy). Nothing else
 * in the suite drives classify.ts directly -- routes.test.ts and
 * balancescale.test.ts both hand-build Observations or go through the
 * engine/graph, never through classifyTip() itself -- so this is the only
 * place a regression here (e.g. accidentally emitting LANDMARK_ONLY for
 * BOTH directions again) would be caught before a live session did.
 */
describe("classifyTip", () => {
  const equalPair = balancescaleItems.find((i) => i.item_id === "itm_bs_1_2v2_4")!; // 1/2 == 2/4, correct: "balances"
  const unequalPair = balancescaleItems.find((i) => i.item_id === "itm_bs_1_2v1_4")!; // 1/2 != 1/4, correct: "doesnt_balance"

  it("marks the correct choice as UNCLASSIFIED@0 regardless of direction", () => {
    expect(classifyTip(equalPair, "balances")).toEqual({ verdict: "correct", signature: "UNCLASSIFIED", signature_confidence: 0 });
    expect(classifyTip(unequalPair, "doesnt_balance")).toEqual({ verdict: "correct", signature: "UNCLASSIFIED", signature_confidence: 0 });
  });

  it("calling a genuinely-equal pair 'doesn't balance' is LANDMARK_ONLY -- over-attending to the surface digits", () => {
    const result = classifyTip(equalPair, "doesnt_balance");
    expect(result).toEqual({ verdict: "incorrect", signature: "LANDMARK_ONLY", signature_confidence: 0.7 });
  });

  it("calling a genuinely-unequal pair 'balances' is UNCLASSIFIED@0 -- a different, currently-unwired error shape", () => {
    const result = classifyTip(unequalPair, "balances");
    expect(result).toEqual({ verdict: "incorrect", signature: "UNCLASSIFIED", signature_confidence: 0 });
  });

  it("covers every genuinely-equal and genuinely-unequal fixture in the real item bank, not just one hand-picked pair each", () => {
    for (const item of balancescaleItems) {
      const trulyBalances = item.correct === "balances";
      const wrongChoice = trulyBalances ? "doesnt_balance" : "balances";
      const result = classifyTip(item, wrongChoice);
      expect(result.verdict).toBe("incorrect");
      if (trulyBalances) {
        expect(result.signature).toBe("LANDMARK_ONLY");
        expect(result.signature_confidence).toBe(0.7);
      } else {
        expect(result.signature).toBe("UNCLASSIFIED");
        expect(result.signature_confidence).toBe(0);
      }
    }
  });
});
