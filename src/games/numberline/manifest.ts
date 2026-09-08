import type { CapabilityManifest } from "../../contracts/schemas.js";

export const numberlineManifest: CapabilityManifest = {
  game_id: "numberline.place.v2",
  assesses: {
    representations: ["NUMBER_LINE"],
    task_types: ["MAGNITUDE_PLACEMENT", "COMPARISON"],
  },
  grade_band: [2, 5],
  duration_s: { min: 90, max: 300 },
  items_per_session: { min: 4, max: 10 },
  reading_required: false,
  difficulty_range: [0.1, 0.9],
  signatures: ["LOG_COMPRESSION", "WHOLE_NUMBER_BIAS", "LONGER_IS_LARGER", "LANDMARK_ONLY"],
};
