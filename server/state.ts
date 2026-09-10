import { ConceptGraph } from "../src/graph/loader.js";
import { GameRegistry, ItemBankRegistry, type ItemBankEntry } from "../src/registry/index.js";
import { LearnerStore } from "../src/store/store.js";
import type { ConceptMetaLookup } from "../src/store/projector.js";
import { numberlineManifest, numberlineItems } from "../src/games/numberline/index.js";
import { fractionbarsManifest, fractionbarsItems, partitionItems } from "../src/games/fractionbars/index.js";
import { balancescaleManifest, balancescaleItems } from "../src/games/balancescale/index.js";

/**
 * Composition root. This is the ONLY file that knows about specific games
 * -- the engine and store never import src/games/*. Registering a new game
 * here (manifest + item source) is the "one manifest added to C5" step
 * roadmap.html C13 allows; nothing in src/engine or src/store changes.
 */

export const graph = ConceptGraph.load();

export const registry = new GameRegistry();
registry.register(numberlineManifest);
// Registered before fractionbarsManifest. This used to be load-bearing:
// registry.matchConcepts() picks games[0] on a solo-concept tie (see
// src/engine/assemble.ts), and F.EQV was briefly a concept both manifests
// capability-matched (BALANCE_SCALE+EQUIVALENCE vs. AREA_MODEL+EQUIVALENCE).
// fractionbars' two F.EQV items were deleted for a wrong answer key /
// concept mismatch (see src/games/fractionbars/items.ts) and its manifest
// no longer declares "EQUIVALENCE" at all, so it no longer capability-
// matches F.EQV -- the tie this order broke doesn't exist any more. Order
// kept as-is (harmless, and Balance Scale capability-matches nothing else)
// rather than reshuffled for no functional reason.
registry.register(balancescaleManifest);
registry.register(fractionbarsManifest);

export const itemBank = new ItemBankRegistry();
itemBank.register(numberlineManifest.game_id, (conceptIds) =>
  numberlineItems
    .filter((i) => conceptIds.includes(i.concept_id))
    .map((i) => ({ item_id: i.item_id, concept_id: i.concept_id, difficulty: i.difficulty })),
);
itemBank.register(fractionbarsManifest.game_id, (conceptIds) => [
  ...fractionbarsItems.filter((i) => conceptIds.includes(i.concept_id)),
  ...partitionItems.filter((i) => conceptIds.includes(i.concept_id)),
].map((i): ItemBankEntry => ({ item_id: i.item_id, concept_id: i.concept_id, difficulty: i.difficulty })));
itemBank.register(balancescaleManifest.game_id, (conceptIds) =>
  balancescaleItems
    .filter((i) => conceptIds.includes(i.concept_id))
    .map((i): ItemBankEntry => ({ item_id: i.item_id, concept_id: i.concept_id, difficulty: i.difficulty })),
);

export const metaOf: ConceptMetaLookup = (conceptId) => {
  const node = graph.node(conceptId);
  return node ? { mastery_threshold: node.mastery_threshold, decay_half_life_days: node.decay_half_life_days } : undefined;
};

const DATA_DIR = new URL("../.data/", import.meta.url).pathname;
export const store = new LearnerStore(metaOf, DATA_DIR + "evidence-log.jsonl");

// One small fixed anchor set per game, reserved for the whole demo cohort.
// See architecture.html #engine "The anchor set, and why adaptivity breaks
// cohort reporting".
export const anchors = new Map<string, ItemBankEntry[]>([
  [
    numberlineManifest.game_id,
    [
      { item_id: "itm_fu_1_8", concept_id: "F.MAG.UNIT", difficulty: 0.5 },
      { item_id: "itm_dm_0_125", concept_id: "D.MAG", difficulty: 0.6 },
    ],
  ],
  [fractionbarsManifest.game_id, [{ item_id: "itm_fb_3_4v2_3", concept_id: "F.MAG.CMP", difficulty: 0.55 }]],
]);

export interface DirectoryEntry {
  student_id: string;
  name: string;
  cohort_id: string;
}

// Minimal name<->id directory, deliberately separate from the evidence log
// (see roadmap.html #nfr privacy constraints: "no child names in the
// evidence log, only opaque IDs; names resolve in a separate directory
// service that analytics joins at render time").
export const directory: DirectoryEntry[] = [
  { student_id: "stu_maya", name: "Maya R.", cohort_id: "coh_demo" },
  { student_id: "stu_devon", name: "Devon P.", cohort_id: "coh_demo" },
  { student_id: "stu_priya", name: "Priya S.", cohort_id: "coh_demo" },
  { student_id: "stu_jonah", name: "Jonah K.", cohort_id: "coh_demo" },
  { student_id: "stu_amara", name: "Amara O.", cohort_id: "coh_demo" },
  { student_id: "stu_leo", name: "Leo M.", cohort_id: "coh_demo" },
];

export function cohortMembers(cohortId: string): DirectoryEntry[] {
  return directory.filter((d) => d.cohort_id === cohortId);
}

export function studentName(studentId: string): string {
  return directory.find((d) => d.student_id === studentId)?.name ?? studentId;
}
