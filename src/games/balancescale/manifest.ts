import type { CapabilityManifest } from "../../contracts/schemas.js";

/**
 * The third game -- see roadmap.html C13 (proven a second time). A new SVG
 * skin (beam-and-two-pans) over the same tap-to-choose interaction
 * `fractionbars` already uses, registered through the manifest + item-bank
 * registries alone -- zero engine or store changes. Scoped to exactly what
 * F.EQV declares (`representations: ["AREA_MODEL", "NUMBER_LINE",
 * "BALANCE_SCALE"]`, `task_types: ["EQUIVALENCE"]`) so its capability-match
 * surface stays narrow to that one node -- see BACKLOG.md's "Balance Scale"
 * item for why COMPARISON is deliberately not added in v1.
 *
 * `signatures` lists exactly what classify.ts can emit: LANDMARK_ONLY, the
 * only signature code with a wired `explains` edge on F.EQV
 * (`LANDMARK_ONLY -> F.MAG.NONUNIT` in strand-magnitude-fractions.json).
 * Earlier this listed WHOLE_NUMBER_BIAS/DENOMINATOR_BIAS reused verbatim
 * from fractionbars' magnitude-comparison classifier -- codes classify.ts
 * no longer emits (F.EQV was being probed as a comparison task, not an
 * equivalence one; see classify.ts's top comment) and which had no wired
 * F.EQV `explains` edge regardless, so `blame()` could never surface a
 * suspect from them. LANDMARK_ONLY is the first F.EQV signature that is
 * actually blame()-traceable.
 */
export const balancescaleManifest: CapabilityManifest = {
  game_id: "balancescale.compare.v1",
  assesses: {
    representations: ["BALANCE_SCALE"],
    task_types: ["EQUIVALENCE"],
  },
  grade_band: [3, 4],
  duration_s: { min: 90, max: 240 },
  items_per_session: { min: 4, max: 8 },
  reading_required: false,
  difficulty_range: [0.2, 0.8],
  signatures: ["LANDMARK_ONLY"],
};
