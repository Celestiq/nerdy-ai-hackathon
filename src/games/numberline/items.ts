import type { SignatureCode } from "../../contracts/signatures.js";

export interface MisconceptionClaim {
  signature: SignatureCode;
  /** centre of the claimed region, on the same 0..1 line as the item */
  at: number;
  /** half-width of the claimed region */
  width: number;
}

export interface NumberlineItem {
  item_id: string;
  concept_id: string;
  /** what the child is asked to place, shown verbatim, no reading beyond a numeral/fraction glyph */
  prompt: string;
  /** the line's labelled endpoints, for rendering only */
  scale: [number, number];
  target: number; // 0..1, normalised position on the line
  tolerance: number;
  difficulty: number;
  claims: MisconceptionClaim[];
}

/**
 * Hand-authored item bank. Every item's misconception regions are declared
 * here, in advance, and reviewed -- see architecture.html #games
 * "Forbidden in an Evidence Bundle" and roadmap.html C8 "Editorial" gate.
 */
export const numberlineItems: NumberlineItem[] = [
  {
    item_id: "itm_nc_7",
    concept_id: "N.COUNT",
    prompt: "7",
    scale: [0, 10],
    target: 0.7,
    tolerance: 0.07,
    difficulty: 0.2,
    claims: [],
  },
  {
    item_id: "itm_nc_3",
    concept_id: "N.COUNT",
    prompt: "3",
    scale: [0, 10],
    target: 0.3,
    tolerance: 0.07,
    difficulty: 0.15,
    claims: [],
  },
  {
    item_id: "itm_nc_5",
    concept_id: "N.COUNT",
    prompt: "5",
    scale: [0, 10],
    target: 0.5,
    tolerance: 0.07,
    difficulty: 0.18,
    claims: [],
  },
  {
    item_id: "itm_nc_9",
    concept_id: "N.COUNT",
    prompt: "9",
    scale: [0, 10],
    target: 0.9,
    tolerance: 0.07,
    difficulty: 0.25,
    claims: [],
  },
  {
    item_id: "itm_no_12",
    concept_id: "N.ORD",
    prompt: "12",
    scale: [0, 20],
    target: 0.6,
    tolerance: 0.06,
    difficulty: 0.3,
    claims: [],
  },
  {
    item_id: "itm_no_17",
    concept_id: "N.ORD",
    prompt: "17",
    scale: [0, 20],
    target: 0.85,
    tolerance: 0.06,
    difficulty: 0.35,
    claims: [],
  },
  {
    item_id: "itm_no_4",
    concept_id: "N.ORD",
    prompt: "4",
    scale: [0, 20],
    target: 0.2,
    tolerance: 0.06,
    difficulty: 0.25,
    claims: [{ signature: "LANDMARK_ONLY", at: 0.5, width: 0.06 }],
  },
  {
    item_id: "itm_no_9",
    concept_id: "N.ORD",
    prompt: "9",
    scale: [0, 20],
    target: 0.45,
    tolerance: 0.06,
    difficulty: 0.3,
    claims: [],
  },
  {
    item_id: "itm_nl_62",
    concept_id: "N.MAG",
    prompt: "62",
    scale: [0, 100],
    target: 0.62,
    tolerance: 0.05,
    difficulty: 0.3,
    claims: [{ signature: "LOG_COMPRESSION", at: 0.3, width: 0.15 }],
  },
  {
    item_id: "itm_nl_15",
    concept_id: "N.MAG",
    prompt: "15",
    scale: [0, 100],
    target: 0.15,
    tolerance: 0.05,
    difficulty: 0.2,
    claims: [{ signature: "LANDMARK_ONLY", at: 0.5, width: 0.05 }],
  },
  // N.PLACE ("place value: tens and ones") and N.PLACE.HTH ("place value:
  // hundreds") test digit-position understanding specifically, one strand
  // level below N.MAG -- not a re-skin of N.MAG's magnitude-estimation
  // items. The misconception probed here is a two-/three-digit *digit-order*
  // error: a child who has not yet internalised which digit occupies which
  // place swaps two adjacent digits and places the number as if it read
  // differently (e.g. "47" placed where "74" belongs; for the hundreds line,
  // "340" placed where "430" belongs -- the hundreds digit traded for the
  // tens digit). This is categorically different from N.MAG's errors, which
  // are about *estimating where a correctly-read number sits* (log-shaped
  // compression toward the low end, or anchoring only at landmarks like
  // 0/half/max) -- a child with N.MAG's misconceptions has read the number
  // right and misjudges its magnitude, while a child with this misconception
  // has misread which digit means what and would misplace it by a very
  // specific, structured offset, not a vague compression toward one region.
  //
  // Signature choice: SIGNATURE_CODES has LOG_COMPRESSION and LANDMARK_ONLY
  // (already "owned" by N.MAG's items above -- reusing either here would
  // blur exactly the distinction this pair of concepts exists to test) and
  // LONGER_IS_LARGER (already "owned" by D.NOTATE's digit-string-length
  // misreading, a different failure mode again -- that one is about string
  // length implying size, not digit position). RANGE_COMPRESSION is declared
  // in the enum but unused anywhere in the codebase before this commit. It's
  // the best semantic fit here: the child's placement isn't spread according
  // to the true value, it collapses into the wrong *sub-range* of the line
  // determined by a swapped digit -- e.g. "47" (true sub-range: the 40s)
  // collapses into the 70s sub-range because the digits were read in the
  // wrong order. That's a range-level displacement, not a landmark anchor or
  // a log-shaped bunching, so RANGE_COMPRESSION is used for both concepts
  // below rather than reusing a signature already carrying a different
  // concept's meaning. Flagging this explicitly for pedagogy-reviewer, same
  // as D.NOTATE's signature choice was flagged and reviewed last cycle.
  {
    item_id: "itm_np_50",
    concept_id: "N.PLACE",
    prompt: "50",
    scale: [0, 100],
    target: 0.5,
    tolerance: 0.05,
    difficulty: 0.3,
    // round decade number: swapping tens/ones ("05") isn't a coherent
    // two-digit misplacement, so this is a plain anchor item, no claim --
    // same role itm_dn_0_4 plays for D.NOTATE above.
    claims: [],
  },
  {
    item_id: "itm_np_47",
    concept_id: "N.PLACE",
    prompt: "47",
    scale: [0, 100],
    target: 0.47,
    tolerance: 0.05,
    difficulty: 0.4,
    claims: [{ signature: "RANGE_COMPRESSION", at: 0.74, width: 0.07 }],
  },
  {
    item_id: "itm_np_29",
    concept_id: "N.PLACE",
    prompt: "29",
    scale: [0, 100],
    target: 0.29,
    tolerance: 0.05,
    difficulty: 0.45,
    claims: [{ signature: "RANGE_COMPRESSION", at: 0.92, width: 0.06 }],
  },
  {
    item_id: "itm_np_63",
    concept_id: "N.PLACE",
    prompt: "63",
    scale: [0, 100],
    target: 0.63,
    tolerance: 0.05,
    difficulty: 0.4,
    claims: [{ signature: "RANGE_COMPRESSION", at: 0.36, width: 0.07 }],
  },
  {
    item_id: "itm_nph_500",
    concept_id: "N.PLACE.HTH",
    prompt: "500",
    scale: [0, 1000],
    target: 0.5,
    tolerance: 0.04,
    difficulty: 0.4,
    // round-hundred anchor, same role as itm_np_50 above: no coherent
    // hundreds/tens swap for a number with a zero tens digit.
    claims: [],
  },
  {
    item_id: "itm_nph_340",
    concept_id: "N.PLACE.HTH",
    prompt: "340",
    scale: [0, 1000],
    target: 0.34,
    tolerance: 0.03,
    difficulty: 0.5,
    // hundreds/tens digit swap: "340" placed as if it were "430".
    claims: [{ signature: "RANGE_COMPRESSION", at: 0.43, width: 0.03 }],
  },
  {
    item_id: "itm_nph_270",
    concept_id: "N.PLACE.HTH",
    prompt: "270",
    scale: [0, 1000],
    target: 0.27,
    tolerance: 0.03,
    difficulty: 0.55,
    // hundreds/tens digit swap: "270" placed as if it were "720".
    claims: [{ signature: "RANGE_COMPRESSION", at: 0.72, width: 0.03 }],
  },
  {
    item_id: "itm_nph_615",
    concept_id: "N.PLACE.HTH",
    prompt: "615",
    scale: [0, 1000],
    target: 0.615,
    tolerance: 0.03,
    difficulty: 0.6,
    // hundreds/tens digit swap: "615" placed as if it were "165".
    claims: [{ signature: "RANGE_COMPRESSION", at: 0.165, width: 0.03 }],
  },
  {
    item_id: "itm_fu_1_8",
    concept_id: "F.MAG.UNIT",
    prompt: "1/8",
    scale: [0, 1],
    target: 0.125,
    tolerance: 0.06,
    difficulty: 0.5,
    claims: [{ signature: "WHOLE_NUMBER_BIAS", at: 0.8, width: 0.15 }],
  },
  {
    item_id: "itm_fu_1_4",
    concept_id: "F.MAG.UNIT",
    prompt: "1/4",
    scale: [0, 1],
    target: 0.25,
    tolerance: 0.06,
    difficulty: 0.35,
    claims: [{ signature: "WHOLE_NUMBER_BIAS", at: 0.4, width: 0.12 }],
  },
  {
    item_id: "itm_fu_1_6",
    concept_id: "F.MAG.UNIT",
    prompt: "1/6",
    scale: [0, 1],
    target: 1 / 6,
    tolerance: 0.06,
    difficulty: 0.55,
    claims: [{ signature: "WHOLE_NUMBER_BIAS", at: 0.6, width: 0.12 }],
  },
  {
    item_id: "itm_fu_1_10",
    concept_id: "F.MAG.UNIT",
    prompt: "1/10",
    scale: [0, 1],
    target: 0.1,
    tolerance: 0.05,
    difficulty: 0.6,
    claims: [{ signature: "WHOLE_NUMBER_BIAS", at: 1.0, width: 0.1 }],
  },
  {
    item_id: "itm_fn_3_4",
    concept_id: "F.MAG.NONUNIT",
    prompt: "3/4",
    scale: [0, 1],
    target: 0.75,
    tolerance: 0.06,
    difficulty: 0.45,
    claims: [{ signature: "WHOLE_NUMBER_BIAS", at: 0.4, width: 0.12 }],
  },
  {
    item_id: "itm_fn_2_5",
    concept_id: "F.MAG.NONUNIT",
    prompt: "2/5",
    scale: [0, 1],
    target: 0.4,
    tolerance: 0.06,
    difficulty: 0.5,
    claims: [{ signature: "WHOLE_NUMBER_BIAS", at: 0.6, width: 0.1 }],
  },
  // D.NOTATE ("decimal notation: tenths and hundredths place") -- unlike
  // D.MAG's items below, which test raw magnitude estimation, these isolate
  // place-value *reading* errors: treating the digit string after the
  // decimal point as a whole number whose length drives perceived size
  // (itm_dn_0_36, misread as "36" and placed too high), and losing track of
  // which place a digit sits in once a leading zero is involved
  // (itm_dn_0_04/itm_dn_0_09, misread as if the leading zero didn't count,
  // off by exactly the factor of ten the place value determines). Both are
  // notation-reading failures, not magnitude-estimation ones. itm_dn_0_4 has
  // no claim: it's a plain magnitude anchor for the pair, not a
  // misconception probe on its own (a short digit string being misread as
  // "too small" isn't a coherent single-item signal -- that comparison only
  // makes sense as a COMPARISON-task item, which D.NOTATE doesn't have yet).
  {
    item_id: "itm_dn_0_4",
    concept_id: "D.NOTATE",
    prompt: "0.4",
    scale: [0, 1],
    target: 0.4,
    tolerance: 0.05,
    difficulty: 0.5,
    claims: [],
  },
  {
    item_id: "itm_dn_0_36",
    concept_id: "D.NOTATE",
    prompt: "0.36",
    scale: [0, 1],
    target: 0.36,
    tolerance: 0.05,
    difficulty: 0.55,
    claims: [{ signature: "LONGER_IS_LARGER", at: 0.75, width: 0.15 }],
  },
  {
    item_id: "itm_dn_0_04",
    concept_id: "D.NOTATE",
    prompt: "0.04",
    scale: [0, 1],
    target: 0.04,
    tolerance: 0.03,
    difficulty: 0.6,
    claims: [{ signature: "LONGER_IS_LARGER", at: 0.4, width: 0.08 }],
  },
  {
    item_id: "itm_dn_0_09",
    concept_id: "D.NOTATE",
    prompt: "0.09",
    scale: [0, 1],
    target: 0.09,
    tolerance: 0.03,
    difficulty: 0.65,
    claims: [{ signature: "LONGER_IS_LARGER", at: 0.9, width: 0.1 }],
  },
  {
    item_id: "itm_dm_0_125",
    concept_id: "D.MAG",
    prompt: "0.125",
    scale: [0, 1],
    target: 0.125,
    tolerance: 0.06,
    difficulty: 0.6,
    claims: [
      { signature: "LONGER_IS_LARGER", at: 0.8, width: 0.15 },
      { signature: "LOG_COMPRESSION", at: 0.3, width: 0.1 },
    ],
  },
  {
    item_id: "itm_dm_0_7",
    concept_id: "D.MAG",
    prompt: "0.7",
    scale: [0, 1],
    target: 0.7,
    tolerance: 0.06,
    difficulty: 0.4,
    claims: [{ signature: "LOG_COMPRESSION", at: 0.4, width: 0.15 }],
  },
  {
    item_id: "itm_dc_0_125",
    concept_id: "D.MAG.CMP",
    prompt: "0.125",
    scale: [0, 1],
    target: 0.125,
    tolerance: 0.06,
    difficulty: 0.65,
    claims: [{ signature: "LONGER_IS_LARGER", at: 0.85, width: 0.12 }],
  },
  {
    item_id: "itm_dc_0_09",
    concept_id: "D.MAG.CMP",
    prompt: "0.09",
    scale: [0, 1],
    target: 0.09,
    tolerance: 0.05,
    difficulty: 0.7,
    claims: [{ signature: "LONGER_IS_LARGER", at: 0.6, width: 0.15 }],
  },
];

export function itemsForConcept(conceptId: string): NumberlineItem[] {
  return numberlineItems.filter((i) => i.concept_id === conceptId);
}
