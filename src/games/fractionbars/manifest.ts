import type { CapabilityManifest } from "../../contracts/schemas.js";

/**
 * The second game -- see roadmap.html C13. A different mechanic (two-
 * alternative forced choice) and a different representation (AREA_MODEL)
 * from the number line, registered through the manifest alone.
 *
 * task_types deliberately does NOT include "EQUIVALENCE": renderCompare's
 * mechanic only asks "which is bigger", which has no valid answer for a
 * genuinely equivalent pair (F.EQV's own task type). Two F.EQV items were
 * authored here anyway; one was mathematically wrong as a result (see
 * items.ts's comment above where they used to live) and both are deleted,
 * not reassigned. F.EQV's capability now belongs solely to
 * balancescale.compare.v1, which was purpose-built for equivalence
 * judgements (a scale that balances or doesn't, not a bigger/smaller pick).
 */
export const fractionbarsManifest: CapabilityManifest = {
  game_id: "fractionbars.compare.v1",
  assesses: {
    representations: ["AREA_MODEL"],
    task_types: ["COMPARISON", "PARTITION"],
  },
  grade_band: [1, 4],
  duration_s: { min: 90, max: 240 },
  items_per_session: { min: 4, max: 8 },
  reading_required: false,
  difficulty_range: [0.2, 0.8],
  signatures: ["WHOLE_NUMBER_BIAS", "DENOMINATOR_BIAS"],
};
