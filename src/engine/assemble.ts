import type { ConceptGraph } from "../graph/loader.js";
import type { GameRegistry, ItemBankRegistry, ItemBankEntry } from "../registry/index.js";
import type { ItemSpec } from "../contracts/schemas.js";

export interface AssembleResult {
  game_id: string;
  concepts: string[];
  item_specs: ItemSpec[];
  time_budget_s: number;
}

/**
 * Step 4-5 of the pipeline: match a game against manifests for the chosen
 * concepts, then assemble item specs -- anchors first, then the adaptive
 * tail. See architecture.html #engine figure and "The anchor set" section.
 */
export function assembleAssignment(
  graph: ConceptGraph,
  registry: GameRegistry,
  itemBank: ItemBankRegistry,
  chosenConcepts: string[],
  anchors: Map<string, ItemBankEntry[]>,
): AssembleResult | undefined {
  if (chosenConcepts.length === 0) return undefined;

  let games = registry.matchConcepts(graph, chosenConcepts);
  let concepts = chosenConcepts;
  if (games.length === 0) {
    // fall back to the single top concept if no one game covers the whole set
    concepts = [chosenConcepts[0]];
    games = registry.matchConcept(graph, concepts[0]);
  }
  if (games.length === 0) return undefined;

  const manifest = games[0];
  // Anchors are deliberately NOT filtered to the adaptively-chosen concepts:
  // the whole point is a fixed common item set regardless of routing. See
  // architecture.html #engine "The anchor set, and why adaptivity breaks
  // cohort reporting".
  const anchorItems = anchors.get(manifest.game_id) ?? [];
  concepts = [...new Set([...concepts, ...anchorItems.map((a) => a.concept_id)])];

  const pool = itemBank.itemsForConcepts(manifest.game_id, concepts);
  const anchorIds = new Set(anchorItems.map((a) => a.item_id));
  const nonAnchorPool = pool.filter((i) => !anchorIds.has(i.item_id));

  const maxItems = manifest.items_per_session.max;
  const remaining = Math.max(0, maxItems - anchorItems.length);
  const tail = nonAnchorPool.slice(0, remaining);

  const item_specs: ItemSpec[] = [
    ...anchorItems.map((a) => ({ item_id: a.item_id, concept_id: a.concept_id, difficulty: a.difficulty, is_anchor: true })),
    ...tail.map((i) => ({ item_id: i.item_id, concept_id: i.concept_id, difficulty: i.difficulty, is_anchor: false })),
  ];

  return {
    game_id: manifest.game_id,
    concepts,
    item_specs,
    time_budget_s: manifest.duration_s.max,
  };
}
