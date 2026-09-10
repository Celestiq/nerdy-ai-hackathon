/**
 * Local to this game -- deliberately not importing `FractionRef` from
 * `src/games/fractionbars/`. No cross-game imports exist anywhere in this
 * repo today (numberline and fractionbars are already fully decoupled);
 * this game keeps that pattern rather than being the first exception.
 */
export interface BalanceWeight {
  numerator: number;
  denominator: number;
}

export interface BalanceScaleItem {
  item_id: string;
  concept_id: string;
  difficulty: number;
  left: BalanceWeight;
  right: BalanceWeight;
  // Whether the two pans genuinely balance (equal value) or not -- this is
  // an EQUIVALENCE judgement (do these two fractions name the same amount),
  // not a magnitude comparison (which one is bigger). See classify.ts's
  // top comment for why this distinction is load-bearing.
  correct: "balances" | "doesnt_balance";
}

function decimalOf(w: BalanceWeight): number {
  return w.numerator / w.denominator;
}

/**
 * Hand-authored pairs, all on F.EQV -- "does the scale balance?" A genuine
 * mix of truly-equivalent pairs (correct: "balances") and genuinely-unequal
 * pairs (correct: "doesnt_balance"), per pedagogy-reviewer's REQUIRED
 * CHANGES on the original build: the first version asked "which pan tips
 * down" on strict magnitude comparisons only, never once presenting two
 * fractions of equal value -- that tested F.MAG.CMP's skill, not F.EQV's
 * (task_types: ["EQUIVALENCE"]) despite being registered on the latter.
 *
 * The three "balances" pairs are checked by cross-multiplication, not
 * eyeballed decimals: 1*4 === 2*2 (1/2 == 2/4), 2*6 === 4*3 (2/3 == 4/6),
 * 3*8 === 6*4 (3/4 == 6/8).
 */
export const balancescaleItems: BalanceScaleItem[] = [
  // Genuinely equal -- the scale truly balances.
  { item_id: "itm_bs_1_2v2_4", concept_id: "F.EQV", difficulty: 0.3, left: { numerator: 1, denominator: 2 }, right: { numerator: 2, denominator: 4 }, correct: "balances" },
  { item_id: "itm_bs_2_3v4_6", concept_id: "F.EQV", difficulty: 0.4, left: { numerator: 2, denominator: 3 }, right: { numerator: 4, denominator: 6 }, correct: "balances" },
  { item_id: "itm_bs_3_4v6_8", concept_id: "F.EQV", difficulty: 0.45, left: { numerator: 3, denominator: 4 }, right: { numerator: 6, denominator: 8 }, correct: "balances" },

  // Genuinely unequal -- carried over from the original six-item bank
  // (same values, `correct` relabelled from a side to a balance verdict).
  { item_id: "itm_bs_1_2v1_4", concept_id: "F.EQV", difficulty: 0.3, left: { numerator: 1, denominator: 2 }, right: { numerator: 1, denominator: 4 }, correct: "doesnt_balance" },
  { item_id: "itm_bs_2_3v1_2", concept_id: "F.EQV", difficulty: 0.4, left: { numerator: 2, denominator: 3 }, right: { numerator: 1, denominator: 2 }, correct: "doesnt_balance" },
  { item_id: "itm_bs_3_8v1_2", concept_id: "F.EQV", difficulty: 0.45, left: { numerator: 3, denominator: 8 }, right: { numerator: 1, denominator: 2 }, correct: "doesnt_balance" },
  { item_id: "itm_bs_2_5v3_10", concept_id: "F.EQV", difficulty: 0.5, left: { numerator: 2, denominator: 5 }, right: { numerator: 3, denominator: 10 }, correct: "doesnt_balance" },
  { item_id: "itm_bs_1_3v2_5", concept_id: "F.EQV", difficulty: 0.55, left: { numerator: 1, denominator: 3 }, right: { numerator: 2, denominator: 5 }, correct: "doesnt_balance" },
  { item_id: "itm_bs_5_6v3_4", concept_id: "F.EQV", difficulty: 0.6, left: { numerator: 5, denominator: 6 }, right: { numerator: 3, denominator: 4 }, correct: "doesnt_balance" },
];

export { decimalOf };

export function itemsForConcept(conceptId: string): BalanceScaleItem[] {
  return balancescaleItems.filter((i) => i.concept_id === conceptId);
}
