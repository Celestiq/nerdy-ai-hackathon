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
  // N.MAG's LOG_COMPRESSION claims follow the research direction
  // (Siegler & Opfer 2003): a child whose number line is logarithmically
  // compressed spreads SMALL numbers out (places them too far right) and
  // squeezes large ones together at the high end. The claim sits at the
  // log-predicted position log(n)/log(100) on the 0..100 line. Cycle 18 (C1,
  // pedagogy review) re-pointed itm_nl_62's claim from 0.3 (the old,
  // backwards "squeezed toward the low end" reading) to that position.
  {
    item_id: "itm_nl_62",
    concept_id: "N.MAG",
    prompt: "62",
    scale: [0, 100],
    target: 0.62,
    tolerance: 0.05,
    difficulty: 0.3,
    // log(62)/log(100) ~= 0.90
    claims: [{ signature: "LOG_COMPRESSION", at: 0.9, width: 0.05 }],
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
  // N.MAG pool (C1, cycle 18). LOG_COMPRESSION as described above;
  // LANDMARK_ONLY = snapping to the nearest landmark (0 / 50 / 100) instead of
  // estimating. Numbers chosen so none repeats an N.PLACE prompt, and every
  // claim region is disjoint from its target's tolerance band.
  {
    item_id: "itm_nl_40",
    concept_id: "N.MAG",
    prompt: "40",
    scale: [0, 100],
    target: 0.4,
    tolerance: 0.05,
    difficulty: 0.25,
    // near-middle number: snapping to the 50 landmark instead of estimating
    claims: [{ signature: "LANDMARK_ONLY", at: 0.5, width: 0.025 }],
  },
  {
    item_id: "itm_nl_27",
    concept_id: "N.MAG",
    prompt: "27",
    scale: [0, 100],
    target: 0.27,
    tolerance: 0.05,
    difficulty: 0.45,
    // no nearby landmark: a landmark-only child drops it at the middle
    claims: [{ signature: "LANDMARK_ONLY", at: 0.5, width: 0.06 }],
  },
  {
    item_id: "itm_nl_5",
    concept_id: "N.MAG",
    prompt: "5",
    scale: [0, 100],
    target: 0.05,
    tolerance: 0.03,
    difficulty: 0.4,
    // log(5)/log(100) ~= 0.35: a small number spread far too far right
    claims: [{ signature: "LOG_COMPRESSION", at: 0.35, width: 0.1 }],
  },
  {
    item_id: "itm_nl_20",
    concept_id: "N.MAG",
    prompt: "20",
    scale: [0, 100],
    target: 0.2,
    tolerance: 0.04,
    difficulty: 0.5,
    // log(20)/log(100) ~= 0.65
    claims: [{ signature: "LOG_COMPRESSION", at: 0.65, width: 0.08 }],
  },
  {
    item_id: "itm_nl_58",
    concept_id: "N.MAG",
    prompt: "58",
    scale: [0, 100],
    target: 0.58,
    tolerance: 0.04,
    difficulty: 0.65,
    // log(58)/log(100) ~= 0.88
    claims: [{ signature: "LOG_COMPRESSION", at: 0.88, width: 0.08 }],
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
  // C1 (cycle 18): same tens/ones swap construction as above.
  {
    item_id: "itm_np_52",
    concept_id: "N.PLACE",
    prompt: "52",
    scale: [0, 100],
    target: 0.52,
    tolerance: 0.05,
    difficulty: 0.35,
    // "52" placed as if it were "25"
    claims: [{ signature: "RANGE_COMPRESSION", at: 0.25, width: 0.07 }],
  },
  {
    item_id: "itm_np_81",
    concept_id: "N.PLACE",
    prompt: "81",
    scale: [0, 100],
    target: 0.81,
    tolerance: 0.05,
    difficulty: 0.5,
    // "81" placed as if it were "18"
    claims: [{ signature: "RANGE_COMPRESSION", at: 0.18, width: 0.07 }],
  },
  {
    item_id: "itm_np_86",
    concept_id: "N.PLACE",
    prompt: "86",
    scale: [0, 100],
    target: 0.86,
    tolerance: 0.05,
    difficulty: 0.6,
    // "86" placed as if it were "68"
    claims: [{ signature: "RANGE_COMPRESSION", at: 0.68, width: 0.06 }],
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
    // width narrowed 0.12 -> 0.06 in cycle 18 (C1 pedagogy review): the old
    // region overlapped the 0.19..0.31 tolerance band.
    claims: [{ signature: "WHOLE_NUMBER_BIAS", at: 0.4, width: 0.06 }],
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
  // C1 (cycle 18): same denominator/10 WHOLE_NUMBER_BIAS construction as
  // above (1/2), plus two LANDMARK_ONLY probes (1/5, 1/3) -- the graph's
  // other explains edge at F.MAG.UNIT (anchoring on 0 / half / 1 instead of
  // partitioning).
  {
    item_id: "itm_fu_1_2",
    concept_id: "F.MAG.UNIT",
    prompt: "1/2",
    scale: [0, 1],
    target: 0.5,
    tolerance: 0.06,
    difficulty: 0.2,
    claims: [{ signature: "WHOLE_NUMBER_BIAS", at: 0.2, width: 0.1 }],
  },
  {
    item_id: "itm_fu_1_5",
    concept_id: "F.MAG.UNIT",
    prompt: "1/5",
    scale: [0, 1],
    target: 0.2,
    tolerance: 0.06,
    difficulty: 0.4,
    // snapping to the half landmark instead of fifths
    claims: [{ signature: "LANDMARK_ONLY", at: 0.5, width: 0.06 }],
  },
  {
    item_id: "itm_fu_1_3",
    concept_id: "F.MAG.UNIT",
    prompt: "1/3",
    scale: [0, 1],
    target: 1 / 3,
    tolerance: 0.06,
    difficulty: 0.45,
    // snapping to the half landmark instead of thirds
    claims: [{ signature: "LANDMARK_ONLY", at: 0.5, width: 0.06 }],
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
  // F.MAG.NONUNIT pool (C1, cycle 18). WHOLE_NUMBER_BIAS claim uses the same
  // construction as F.MAG.UNIT's items above: the denominator read as a
  // whole number on a 0..10 mental line, i.e. the claim sits at
  // denominator/10 (e.g. 5/8 dropped near 0.8). Every claim region is
  // disjoint from its target's tolerance band.
  {
    item_id: "itm_fn_2_3",
    concept_id: "F.MAG.NONUNIT",
    prompt: "2/3",
    scale: [0, 1],
    target: 2 / 3,
    tolerance: 0.06,
    difficulty: 0.35,
    claims: [{ signature: "WHOLE_NUMBER_BIAS", at: 0.3, width: 0.1 }],
  },
  {
    item_id: "itm_fn_5_8",
    concept_id: "F.MAG.NONUNIT",
    prompt: "5/8",
    scale: [0, 1],
    target: 0.625,
    tolerance: 0.06,
    difficulty: 0.55,
    claims: [{ signature: "WHOLE_NUMBER_BIAS", at: 0.8, width: 0.07 }],
  },
  {
    item_id: "itm_fn_5_6",
    concept_id: "F.MAG.NONUNIT",
    prompt: "5/6",
    scale: [0, 1],
    target: 5 / 6,
    tolerance: 0.06,
    difficulty: 0.6,
    claims: [{ signature: "WHOLE_NUMBER_BIAS", at: 0.6, width: 0.08 }],
  },
  {
    item_id: "itm_fn_7_10",
    concept_id: "F.MAG.NONUNIT",
    prompt: "7/10",
    scale: [0, 1],
    target: 0.7,
    tolerance: 0.05,
    difficulty: 0.7,
    claims: [{ signature: "WHOLE_NUMBER_BIAS", at: 1.0, width: 0.1 }],
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
    // Cycle 18 (C1 pedagogy review): claim moved from 0.4 to the
    // log-compressed position, log(70)/log(100) ~= 0.92 -- see the D.MAG pool
    // comment below.
    claims: [{ signature: "LOG_COMPRESSION", at: 0.92, width: 0.05 }],
  },
  // D.MAG pool (C1, cycle 18). LOG_COMPRESSION follows the research direction
  // (Siegler & Opfer 2003; same convention as N.MAG above): read as hundredths
  // on a log-compressed line, a decimal x lands at log(100x)/log(100), so
  // small decimals are placed too far RIGHT and larger ones squeezed up at
  // the high end. LONGER_IS_LARGER (a long digit string read as big, claim
  // right of a small target) only for the thousandths item, same pairing the
  // itm_dm_0_125 anchor already uses. No prompt repeats a D.NOTATE or
  // D.MAG.CMP prompt; every claim region is disjoint from its tolerance band.
  {
    item_id: "itm_dm_0_2",
    concept_id: "D.MAG",
    prompt: "0.2",
    scale: [0, 1],
    target: 0.2,
    tolerance: 0.05,
    difficulty: 0.3,
    // log(20)/log(100) ~= 0.65
    claims: [{ signature: "LOG_COMPRESSION", at: 0.65, width: 0.08 }],
  },
  {
    item_id: "itm_dm_0_3",
    concept_id: "D.MAG",
    prompt: "0.3",
    scale: [0, 1],
    target: 0.3,
    tolerance: 0.05,
    difficulty: 0.35,
    // log(30)/log(100) ~= 0.74
    claims: [{ signature: "LOG_COMPRESSION", at: 0.74, width: 0.08 }],
  },
  {
    item_id: "itm_dm_0_45",
    concept_id: "D.MAG",
    prompt: "0.45",
    scale: [0, 1],
    target: 0.45,
    tolerance: 0.05,
    difficulty: 0.5,
    // log(45)/log(100) ~= 0.83
    claims: [{ signature: "LOG_COMPRESSION", at: 0.83, width: 0.06 }],
  },
  {
    item_id: "itm_dm_0_375",
    concept_id: "D.MAG",
    prompt: "0.375",
    scale: [0, 1],
    target: 0.375,
    tolerance: 0.05,
    difficulty: 0.65,
    claims: [{ signature: "LONGER_IS_LARGER", at: 0.8, width: 0.12 }],
  },
  // D.MAG.CMP ("compare decimals"). The graph's explains edge for this
  // concept is LONGER_IS_LARGER ("0.125 read as larger than 0.5 because
  // '125' > '5'"), so every item is a decimal whose digit string is long
  // relative to its value, with the claim placed high on the line where a
  // digit-count reading puts it. Cycle 18 (C1): the former itm_dc_0_125 and
  // itm_dc_0_09 were removed -- they were byte-for-byte the same content as
  // the itm_dm_0_125 cohort anchor (D.MAG) and itm_dn_0_09 (D.NOTATE), so a
  // response to one was indistinguishable from the other concept's item.
  {
    item_id: "itm_dc_0_15",
    concept_id: "D.MAG.CMP",
    prompt: "0.15",
    scale: [0, 1],
    target: 0.15,
    tolerance: 0.05,
    difficulty: 0.3,
    claims: [{ signature: "LONGER_IS_LARGER", at: 0.65, width: 0.15 }],
  },
  {
    item_id: "itm_dc_0_32",
    concept_id: "D.MAG.CMP",
    prompt: "0.32",
    scale: [0, 1],
    target: 0.32,
    tolerance: 0.05,
    difficulty: 0.38,
    claims: [{ signature: "LONGER_IS_LARGER", at: 0.78, width: 0.12 }],
  },
  {
    item_id: "itm_dc_0_48",
    concept_id: "D.MAG.CMP",
    prompt: "0.48",
    scale: [0, 1],
    target: 0.48,
    tolerance: 0.05,
    difficulty: 0.45,
    claims: [{ signature: "LONGER_IS_LARGER", at: 0.88, width: 0.08 }],
  },
  {
    item_id: "itm_dc_0_205",
    concept_id: "D.MAG.CMP",
    prompt: "0.205",
    scale: [0, 1],
    target: 0.205,
    tolerance: 0.05,
    difficulty: 0.55,
    claims: [{ signature: "LONGER_IS_LARGER", at: 0.75, width: 0.15 }],
  },
  {
    item_id: "itm_dc_0_105",
    concept_id: "D.MAG.CMP",
    prompt: "0.105",
    scale: [0, 1],
    target: 0.105,
    tolerance: 0.04,
    difficulty: 0.65,
    claims: [{ signature: "LONGER_IS_LARGER", at: 0.7, width: 0.15 }],
  },
  {
    item_id: "itm_dc_0_275",
    concept_id: "D.MAG.CMP",
    prompt: "0.275",
    scale: [0, 1],
    target: 0.275,
    tolerance: 0.04,
    difficulty: 0.7,
    claims: [{ signature: "LONGER_IS_LARGER", at: 0.85, width: 0.12 }],
  },
];

export function itemsForConcept(conceptId: string): NumberlineItem[] {
  return numberlineItems.filter((i) => i.concept_id === conceptId);
}
