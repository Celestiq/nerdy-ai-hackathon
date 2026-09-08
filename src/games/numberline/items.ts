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
