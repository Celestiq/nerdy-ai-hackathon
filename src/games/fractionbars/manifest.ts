import type { CapabilityManifest } from "../../contracts/schemas.js";

/**
 * The second game -- see roadmap.html C13. A different mechanic (two-
 * alternative forced choice) and a different representation (AREA_MODEL)
 * from the number line, registered through the manifest alone.
 */
export const fractionbarsManifest: CapabilityManifest = {
  game_id: "fractionbars.compare.v1",
  assesses: {
    representations: ["AREA_MODEL"],
    task_types: ["COMPARISON", "EQUIVALENCE"],
  },
  grade_band: [3, 4],
  duration_s: { min: 90, max: 240 },
  items_per_session: { min: 4, max: 8 },
  reading_required: false,
  difficulty_range: [0.2, 0.8],
  signatures: ["WHOLE_NUMBER_BIAS", "DENOMINATOR_BIAS"],
};
