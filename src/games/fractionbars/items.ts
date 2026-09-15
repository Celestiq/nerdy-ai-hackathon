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
  // C1 (cycle 18): pool deepened past items_per_session.max (8) so rotation
  // actually varies a F.MAG.CMP-only session, and `correct` rebalanced
  // (was "a" on 3 of 4; now a:4 / b:5 -- the first three rows above are
  // left as-is because itm_fb_3_4v2_3 is the cohort anchor and
  // itm_fb_1_3v1_8 is pinned by tests/routes.test.ts). Every wrong option is
  // built so classifyChoice names a signature, never UNCLASSIFIED: the
  // distractor has the same numerator and a larger denominator
  // (DENOMINATOR_BIAS) or a larger numerator but smaller value
  // (WHOLE_NUMBER_BIAS). Tally of distractor signatures over the whole
  // pool: DENOMINATOR_BIAS 4, WHOLE_NUMBER_BIAS 4, UNCLASSIFIED 1 (the anchor).
  { item_id: "itm_fb_1_5v1_2", concept_id: "F.MAG.CMP", difficulty: 0.3, a: { numerator: 1, denominator: 5 }, b: { numerator: 1, denominator: 2 }, correct: "b" },
  { item_id: "itm_fb_3_8v3_4", concept_id: "F.MAG.CMP", difficulty: 0.45, a: { numerator: 3, denominator: 8 }, b: { numerator: 3, denominator: 4 }, correct: "b" },
  { item_id: "itm_fb_3_5v4_10", concept_id: "F.MAG.CMP", difficulty: 0.6, a: { numerator: 3, denominator: 5 }, b: { numerator: 4, denominator: 10 }, correct: "a" },
  { item_id: "itm_fb_3_8v2_3", concept_id: "F.MAG.CMP", difficulty: 0.65, a: { numerator: 3, denominator: 8 }, b: { numerator: 2, denominator: 3 }, correct: "b" },
  { item_id: "itm_fb_5_12v3_4", concept_id: "F.MAG.CMP", difficulty: 0.7, a: { numerator: 5, denominator: 12 }, b: { numerator: 3, denominator: 4 }, correct: "b" },
];

// F.EQV ("equivalent fractions") used to have two items here
// (itm_fb_2_4v1_2, itm_fb_3_6v2_3) -- both deleted, not fixed. renderCompare
// only asks "which is bigger", so any pair that's genuinely equivalent (as
// F.EQV requires) has no correct bigger/smaller answer under this mechanic;
// itm_fb_2_4v1_2 was exactly that (2/4 == 1/2) and had been live-served with
// a false answer key. itm_fb_3_6v2_3 was a valid magnitude comparison but
// mis-filed under F.EQV rather than F.MAG.CMP. F.EQV's declared task type
// was also removed from fractionbarsManifest below -- see balancescale.ts
// for the game actually built for equivalence judgements.

export { decimalOf };

export function itemsForConcept(conceptId: string): FractionbarsItem[] {
  return fractionbarsItems.filter((i) => i.concept_id === conceptId);
}

/**
 * G.PART has no `explains` edge pointing away from it in the graph, so a
 * wrong answer here never needs a named misconception -- just correct or
 * not. Two shapes are shown (rendered client-side); one is split into
 * equal parts, the other isn't.
 *
 * Two optional, additive fields turn the same pick-one-of-two-pictures
 * mechanic into distinct items for the two concepts one hop off G.PART
 * (cycle 18 C3; before this, all three concepts were `{parts, correct}`
 * only and served the identical pictures):
 *  - `unequalStyle` (G.PART.UNEQUAL): how the not-equal picture is cut.
 *    Absent means "big" -- the original G.PART drawing.
 *  - `shaded` (F.NOTATE): "Which picture shows shaded/parts?" -- the
 *    correct picture is one whole cut into `parts` EQUAL pieces with
 *    `shaded` of them shaded. `distractor` picks the wrong picture (see
 *    notateDistractor). When `shaded` is set, `unequalStyle` is unused.
 */
export type UnequalStyle =
  /** One piece twice as wide as the rest (the original G.PART drawing). */
  | "big"
  /** Same piece count, but one cut is shifted so two neighbours differ. */
  | "offset"
  /** Every piece a slightly different width, narrow to wide. */
  | "strips";

export interface PartitionItem {
  item_id: string;
  concept_id: string;
  difficulty: number;
  parts: number;
  /** Which side is correct: the equal partition, or (with `shaded`) the picture showing shaded/parts. */
  correct: "a" | "b";
  unequalStyle?: UnequalStyle;
  shaded?: number;
  /** F.NOTATE only; absent means "complement". See NotateDistractor. */
  distractor?: NotateDistractor;
}

/**
 * The wrong picture on an F.NOTATE item. Both are one whole cut into equal
 * parts:
 *  - "complement": same D parts, D - N shaded (counts the parts the
 *    numerator doesn't count). Same piece count as the correct picture, so
 *    it tests the numerator only.
 *  - "partpart": N shaded out of N + D parts (reads N/D as "N shaded, D
 *    not shaded"). Same shaded count, different piece count, so matching
 *    the teal count to the numerator isn't enough -- the child has to use
 *    the denominator. N + D is kept <= 8 so the pieces stay readable.
 */
export type NotateDistractor = "complement" | "partpart";

export const partitionItems: PartitionItem[] = [
  { item_id: "itm_gp_halves", concept_id: "G.PART", difficulty: 0.2, parts: 2, correct: "a" },
  { item_id: "itm_gp_thirds", concept_id: "G.PART", difficulty: 0.35, parts: 3, correct: "b" },
  { item_id: "itm_gp_fourths", concept_id: "G.PART", difficulty: 0.3, parts: 4, correct: "a" },
  { item_id: "itm_gp_fifths", concept_id: "G.PART", difficulty: 0.4, parts: 5, correct: "b" },
  { item_id: "itm_gp_sixths", concept_id: "G.PART", difficulty: 0.45, parts: 6, correct: "a" },

  // G.PART.UNEQUAL ("recognise unequal partitions as invalid") -- same
  // pick-the-equal-one mechanic as G.PART, but the not-equal picture is cut
  // more subtly ("offset": one shifted cut; "strips": widths ramp narrow to
  // wide), so spotting the unfair cut is the actual task rather than
  // noticing one obviously double piece. Never "big": that's G.PART's
  // drawing, and reusing it would serve G.PART's exact pictures again.
  // Both pictures always have the same number of pieces, so counting alone
  // can't answer it. A wrong pick stays UNCLASSIFIED (no signature code
  // names "accepts an unequal cut as fair").
  { item_id: "itm_gpu_halves_offset", concept_id: "G.PART.UNEQUAL", difficulty: 0.5, parts: 2, correct: "b", unequalStyle: "offset" },
  { item_id: "itm_gpu_thirds_offset", concept_id: "G.PART.UNEQUAL", difficulty: 0.55, parts: 3, correct: "a", unequalStyle: "offset" },
  { item_id: "itm_gpu_thirds_strips", concept_id: "G.PART.UNEQUAL", difficulty: 0.6, parts: 3, correct: "b", unequalStyle: "strips" },
  { item_id: "itm_gpu_fourths_offset", concept_id: "G.PART.UNEQUAL", difficulty: 0.6, parts: 4, correct: "a", unequalStyle: "offset" },
  { item_id: "itm_gpu_fourths_strips", concept_id: "G.PART.UNEQUAL", difficulty: 0.65, parts: 4, correct: "b", unequalStyle: "strips" },
  { item_id: "itm_gpu_sixths_strips", concept_id: "G.PART.UNEQUAL", difficulty: 0.7, parts: 6, correct: "a", unequalStyle: "strips" },

  // F.NOTATE ("numerator and denominator meaning") -- "Which picture shows
  // N/D?". The correct picture is one whole cut into D equal parts with N
  // shaded; the wrong one is either the complement (D - N of D shaded) or
  // part-to-part (N of N + D shaded), see NotateDistractor. Denominators are
  // grade-3 ones only (2, 3, 4, 6, 8); no complement item with N = D - N
  // (e.g. 1/2), where both pictures would be the same. Side a/b is 3/3.
  // By shaded area the correct picture is the fuller one on 4 items and the
  // emptier on 2: a part-to-part distractor (N/(N+D) < N/D) is always the
  // emptier picture, so both are on the least area-cued picks (1/3 vs 1/4,
  // 1/4 vs 1/5), and the complement items 3/8 and 2/6 keep the correct
  // picture emptier. Every wrong pick is UNCLASSIFIED: both distractors are
  // notation misreads, not WHOLE_NUMBER_BIAS or DENOMINATOR_BIAS (both about
  // comparing two fractions' sizes), and the graph has no explains edge at
  // F.NOTATE.
  { item_id: "itm_fno_1_3", concept_id: "F.NOTATE", difficulty: 0.55, parts: 3, shaded: 1, distractor: "partpart", correct: "a" },
  { item_id: "itm_fno_1_4", concept_id: "F.NOTATE", difficulty: 0.55, parts: 4, shaded: 1, distractor: "partpart", correct: "b" },
  { item_id: "itm_fno_5_6", concept_id: "F.NOTATE", difficulty: 0.6, parts: 6, shaded: 5, distractor: "complement", correct: "b" },
  { item_id: "itm_fno_3_8", concept_id: "F.NOTATE", difficulty: 0.65, parts: 8, shaded: 3, distractor: "complement", correct: "a" },
  { item_id: "itm_fno_7_8", concept_id: "F.NOTATE", difficulty: 0.6, parts: 8, shaded: 7, distractor: "complement", correct: "a" },
  { item_id: "itm_fno_2_6", concept_id: "F.NOTATE", difficulty: 0.6, parts: 6, shaded: 2, distractor: "complement", correct: "b" },
];

/** The wrong picture on an F.NOTATE item, as {parts, shaded}. Mirrored in public/child/child.js renderPartition. */
export function notateDistractor(item: PartitionItem): { parts: number; shaded: number } | undefined {
  if (item.shaded === undefined) return undefined;
  return (item.distractor ?? "complement") === "partpart"
    ? { parts: item.shaded + item.parts, shaded: item.shaded }
    : { parts: item.parts, shaded: item.parts - item.shaded };
}

/**
 * What the child actually sees for a partition item, for the engine's
 * within-session content dedupe (server/state.ts). Includes every field that
 * changes the pictures: part count, the unequal cut style, the shaded
 * count and the F.NOTATE distractor kind -- `partition:${parts}` alone made G.PART / G.PART.UNEQUAL / F.NOTATE
 * items with the same part count collide.
 */
export function partitionContentKey(item: PartitionItem): string {
  if (item.shaded !== undefined) return `partition:${item.parts}:shaded:${item.shaded}:${item.distractor ?? "complement"}`;
  return `partition:${item.parts}:unequal:${item.unequalStyle ?? "big"}`;
}

export function partitionItemsForConcept(conceptId: string): PartitionItem[] {
  return partitionItems.filter((i) => i.concept_id === conceptId);
}
