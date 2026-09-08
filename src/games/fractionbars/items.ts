export interface FractionRef {
  numerator: number;
  denominator: number;
}

export interface FractionbarsItem {
  item_id: string;
  concept_id: string;
  difficulty: number;
  a: FractionRef;
  b: FractionRef;
  correct: "a" | "b";
}

function decimalOf(f: FractionRef): number {
  return f.numerator / f.denominator;
}

/** Hand-authored, reviewed pairs -- see roadmap.html C13 "one signature-region map authored". */
export const fractionbarsItems: FractionbarsItem[] = [
  { item_id: "itm_fb_1_3v1_8", concept_id: "F.MAG.CMP", difficulty: 0.4, a: { numerator: 1, denominator: 3 }, b: { numerator: 1, denominator: 8 }, correct: "a" },
  { item_id: "itm_fb_1_4v1_6", concept_id: "F.MAG.CMP", difficulty: 0.5, a: { numerator: 1, denominator: 4 }, b: { numerator: 1, denominator: 6 }, correct: "a" },
  { item_id: "itm_fb_3_4v2_3", concept_id: "F.MAG.CMP", difficulty: 0.55, a: { numerator: 3, denominator: 4 }, b: { numerator: 2, denominator: 3 }, correct: "a" },
  { item_id: "itm_fb_2_5v1_2", concept_id: "F.MAG.CMP", difficulty: 0.45, a: { numerator: 2, denominator: 5 }, b: { numerator: 1, denominator: 2 }, correct: "b" },
  { item_id: "itm_fb_2_4v1_2", concept_id: "F.EQV", difficulty: 0.3, a: { numerator: 2, denominator: 4 }, b: { numerator: 1, denominator: 2 }, correct: "a" },
  { item_id: "itm_fb_3_6v2_3", concept_id: "F.EQV", difficulty: 0.6, a: { numerator: 3, denominator: 6 }, b: { numerator: 2, denominator: 3 }, correct: "b" },
];

export { decimalOf };

export function itemsForConcept(conceptId: string): FractionbarsItem[] {
  return fractionbarsItems.filter((i) => i.concept_id === conceptId);
}

/**
 * G.PART has no `explains` edge pointing away from it in the graph, so a
 * wrong answer here never needs a named misconception -- just correct or
 * not. Two shapes are shown (rendered client-side); one is split into
 * equal parts, the other isn't.
 */
export interface PartitionItem {
  item_id: string;
  concept_id: string;
  difficulty: number;
  parts: number;
  correct: "a" | "b"; // which side shows an equal partition
}

export const partitionItems: PartitionItem[] = [
  { item_id: "itm_gp_halves", concept_id: "G.PART", difficulty: 0.2, parts: 2, correct: "a" },
  { item_id: "itm_gp_thirds", concept_id: "G.PART", difficulty: 0.35, parts: 3, correct: "b" },
  { item_id: "itm_gp_fourths", concept_id: "G.PART", difficulty: 0.3, parts: 4, correct: "a" },
  { item_id: "itm_gp_fifths", concept_id: "G.PART", difficulty: 0.4, parts: 5, correct: "b" },
  { item_id: "itm_gp_sixths", concept_id: "G.PART", difficulty: 0.45, parts: 6, correct: "a" },
];

export function partitionItemsForConcept(conceptId: string): PartitionItem[] {
  return partitionItems.filter((i) => i.concept_id === conceptId);
}
