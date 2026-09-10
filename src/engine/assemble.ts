import type { ConceptGraph } from "../graph/loader.js";
import type { GameRegistry, ItemBankRegistry, ItemBankEntry } from "../registry/index.js";
import type { ItemSpec } from "../contracts/schemas.js";
import { matchesCapability } from "../graph/query.js";

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
 *
 * Policy: the *highest-scored* chosen concept (chosenConcepts[0]) always
 * picks the serving game -- `registry.matchConcept(chosenConcepts[0])[0]` --
 * rather than requiring one game to cover the whole chosen-concept set
 * first. Whichever other chosen concepts that same game's manifest also
 * covers ride along; concepts it doesn't cover are simply dropped from this
 * assignment (they remain candidates next round). This replaces the old
 * "matchConcepts(whole set) first, solo top-concept fallback second" policy,
 * which almost never took the fallback path under VARIETY_LIMIT=2 -- a game
 * spanning both chosen concepts (e.g. fractionbars covering F.EQV+F.MAG.CMP)
 * always won the matchConcepts() tie, even when a different, narrower game
 * (balancescale, F.EQV-only) was the better fit for the child's actual
 * top-ranked need. "The top-need concept chooses the surface" is the
 * intended rule; see BACKLOG.md's Cycle 11 gap #1 for the full trace of why
 * the old policy silently defeated it. Verified against a live re-seed +
 * server run for all 6 seeded students -- see the commit message.
 */
export function assembleAssignment(
  graph: ConceptGraph,
  registry: GameRegistry,
  itemBank: ItemBankRegistry,
  chosenConcepts: string[],
  anchors: Map<string, ItemBankEntry[]>,
): AssembleResult | undefined {
  if (chosenConcepts.length === 0) return undefined;

  // Walk chosenConcepts in rank order until one has a covering game --
  // "covering" meaning capability-matched AND actually holding authored
  // items for this concept in this game's bank, the same "isCovered"
  // standard src/engine/candidates.ts uses for candidate generation.
  // Capability match alone isn't enough: a manifest can capability-match a
  // concept's representations/task-types/grade-band while its item bank has
  // zero items for it (e.g. numberline.place.v2 capability-matches F.MAG.CMP
  // via COMPARISON+NUMBER_LINE, but every F.MAG.CMP item lives in
  // fractionbars' bank) -- picking such a game as games[0] would produce an
  // empty item pool and fail assembly outright. In practice selectNext()
  // only ever calls this with concepts that already passed isCovered()
  // (src/engine/candidates.ts), so chosenConcepts[0] covers on the first
  // iteration; this loop is a defensive fallback for direct callers (e.g.
  // tests) that pass an uncovered top concept, so a single coverage gap on
  // the #1-ranked concept degrades to "try the next one" rather than either
  // crashing or giving up on the whole assignment when a servable concept is
  // right there in the list.
  let topIndex = -1;
  let games: ReturnType<GameRegistry["matchConcept"]> = [];
  for (let i = 0; i < chosenConcepts.length; i++) {
    const concept = chosenConcepts[i];
    const covering = registry.matchConcept(graph, concept).filter((m) => itemBank.itemsForConcepts(m.game_id, [concept]).length > 0);
    if (covering.length > 0) {
      games = covering;
      topIndex = i;
      break;
    }
  }
  if (topIndex === -1) return undefined; // no chosen concept has any covering game

  const manifest = games[0];
  // Keep the top (first-covered) concept plus whichever OTHER chosen
  // concepts this same manifest actually covers -- capability match AND a
  // non-empty item pool, same standard as the loop above (order preserved).
  let concepts = chosenConcepts.filter((c, i) => {
    if (i === topIndex) return true;
    const node = graph.node(c);
    if (!node || !matchesCapability(node, manifest)) return false;
    return itemBank.itemsForConcepts(manifest.game_id, [c]).length > 0;
  });
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
