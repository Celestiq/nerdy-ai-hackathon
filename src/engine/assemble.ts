import type { ConceptGraph } from "../graph/loader.js";
import type { GameRegistry, ItemBankRegistry, ItemBankEntry } from "../registry/index.js";
import type { ItemSpec } from "../contracts/schemas.js";
import { matchesCapability } from "../graph/query.js";
import { hashInt } from "./hash.js";

export interface AssembleResult {
  game_id: string;
  concepts: string[];
  item_specs: ItemSpec[];
  time_budget_s: number;
  /** Concepts of the anchor items actually served (fixed cohort items; not
   * part of `concepts`, which is only what the engine chose). */
  anchorConcepts: string[];
  /** Anchor items withheld because their concept is STUCK for this child. */
  skippedAnchors: ItemBankEntry[];
}

/**
 * Step 4-5 of the pipeline: match a game against manifests for the chosen
 * concepts, then assemble item specs -- the adaptive tail with the fixed
 * anchor items placed in its back half. See architecture.html #engine figure
 * and "The anchor set" section.
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
 *
 * Session order (Cycle 19 lane G): the tail is drawn only from the chosen
 * concepts -- concepts[0] gets ceil(remaining/2) slots, the others share the
 * rest round-robin, and the two are interleaved starting with concepts[0].
 * Within a concept, items are rotated by `seed` (reproducible, varies per
 * round); the relaxed wheel-spin concept is seed-shuffled instead, so repeat
 * relaxed sessions don't serve the same items. Anchors are inserted at
 * seeded positions in the back half, never first.
 */
export function assembleAssignment(
  graph: ConceptGraph,
  registry: GameRegistry,
  itemBank: ItemBankRegistry,
  chosenConcepts: string[],
  anchors: Map<string, ItemBankEntry[]>,
  seed: string,
  relaxedConceptId?: string,
  stuckConcepts: ReadonlySet<string> = new Set(),
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
  const concepts = chosenConcepts.filter((c, i) => {
    if (i === topIndex) return true;
    const node = graph.node(c);
    if (!node || !matchesCapability(node, manifest)) return false;
    return itemBank.itemsForConcepts(manifest.game_id, [c]).length > 0;
  });
  // Anchors are deliberately NOT filtered to the adaptively-chosen concepts:
  // the whole point is a fixed common item set regardless of routing. See
  // architecture.html #engine "The anchor set, and why adaptivity breaks
  // cohort reporting". Two refinements (Cycle 18 B1):
  //  - anchors are fixed ITEMS, not concepts: their concepts are no longer
  //    unioned into `concepts`, so the adaptive tail is drawn only from what
  //    the engine chose. Unioning them let an unchosen anchor concept (e.g.
  //    F.MAG.UNIT, logged "excluded: variety") take half the session.
  //  - an anchor whose concept is STUCK/escalated for this child is skipped:
  //    re-serving it contradicts the "needs a human" escalation. The caller
  //    passes the set it already computed (engine.ts stuckEscalations) --
  //    no belief lookup happens here.
  const allAnchors = anchors.get(manifest.game_id) ?? [];
  const skippedAnchors = allAnchors.filter((a) => stuckConcepts.has(a.concept_id));
  const anchorItems = allAnchors.filter((a) => !stuckConcepts.has(a.concept_id));

  const pool = itemBank.itemsForConcepts(manifest.game_id, concepts);
  const anchorIds = new Set(allAnchors.map((a) => a.item_id));
  // Within-session dedupe by content key (same prompt/target), anchors
  // first so a fixed cohort item always wins over a same-content tail item
  // authored under another concept. Entries without a content_key fall back
  // to item_id, i.e. are only deduped against themselves. Anchor entries
  // are configured by item_id alone (server/state.ts), so their content key
  // is resolved from the game's own item bank entry for that item_id.
  const anchorBank = new Map(
    itemBank.itemsForConcepts(manifest.game_id, [...new Set(anchorItems.map((a) => a.concept_id))]).map((e) => [e.item_id, e]),
  );
  const seenContent = new Set(anchorItems.map((a) => contentKeyOf(anchorBank.get(a.item_id) ?? a)));
  const nonAnchorPool = pool.filter((i) => !anchorIds.has(i.item_id));

  const maxItems = manifest.items_per_session.max;
  const remaining = Math.max(0, maxItems - anchorItems.length);

  // Per-concept ordering. The relaxed (wheel-spin-unblocked, STUCK) concept
  // gets a seeded shuffle so repeat relaxed sessions differ -- a difficulty
  // sort served the same first N items every time (Devon s3-s13 identical).
  // Every other concept keeps its seeded rotation.
  const queues = new Map<string, ItemBankEntry[]>(
    concepts.map((c) => {
      const own = nonAnchorPool.filter((i) => i.concept_id === c);
      return [c, c === relaxedConceptId ? seededShuffle(own, `${seed}:relaxed:${c}`) : rotate(own, `${seed}:${c}`)];
    }),
  );
  // Pop the next item of `concept` whose content hasn't been served yet.
  const take = (concept: string): ItemBankEntry | undefined => {
    const q = queues.get(concept)!;
    while (q.length > 0) {
      const item = q.shift()!;
      const key = contentKeyOf(item);
      if (seenContent.has(key)) continue;
      seenContent.add(key);
      return item;
    }
    return undefined;
  };

  // Top-concept share: concepts[0] gets ceil(remaining/2) tail slots
  // (capped by its deduped pool); the other chosen concepts fill the rest
  // round-robin; any slot still empty is backfilled from whoever has items
  // left (top first). Replaces one rotate() over the concept-grouped pool,
  // which could hand the top concept 0 items.
  const [top, ...others] = concepts;
  const topItems: ItemBankEntry[] = [];
  const otherItems: ItemBankEntry[] = [];
  const topQuota = Math.ceil(remaining / 2);
  while (topItems.length < topQuota) {
    const item = take(top);
    if (!item) break;
    topItems.push(item);
  }
  const roundRobin = (sources: string[], out: ItemBankEntry[]) => {
    let live = [...sources];
    while (live.length > 0 && topItems.length + otherItems.length < remaining) {
      const next: string[] = [];
      for (const c of live) {
        if (topItems.length + otherItems.length >= remaining) break;
        const item = take(c);
        if (item) {
          out.push(item);
          next.push(c);
        }
      }
      live = next;
    }
  };
  roundRobin(others, otherItems);
  roundRobin([top], topItems);

  // Interleave: top first, then alternate with the others; leftovers last.
  const tail: ItemBankEntry[] = [];
  for (let i = 0; i < Math.max(topItems.length, otherItems.length); i++) {
    if (i < topItems.length) tail.push(topItems[i]);
    if (i < otherItems.length) tail.push(otherItems[i]);
  }

  // Anchors are never first: they go to seed-chosen positions in the back
  // half, so a session opens on the concept the engine chose (not "1/8" or
  // "3/4 vs 2/3" for every child). Only an empty tail forces an anchor first.
  const tailSpecs: ItemSpec[] = tail.map((i) => ({ item_id: i.item_id, concept_id: i.concept_id, difficulty: i.difficulty, is_anchor: false }));
  const anchorSpecs: ItemSpec[] = anchorItems.map((a) => ({ item_id: a.item_id, concept_id: a.concept_id, difficulty: a.difficulty, is_anchor: true }));
  const item_specs = placeAnchors(tailSpecs, anchorSpecs, seed);

  return {
    game_id: manifest.game_id,
    concepts,
    item_specs,
    time_budget_s: manifest.duration_s.max,
    anchorConcepts: [...new Set(anchorItems.map((a) => a.concept_id))],
    skippedAnchors,
  };
}

/**
 * Insert anchors (in their configured order) at seed-chosen positions in the
 * back half of the session: never index 0 while there is any tail item.
 */
function placeAnchors(tail: ItemSpec[], anchorSpecs: ItemSpec[], seed: string): ItemSpec[] {
  if (anchorSpecs.length === 0) return tail;
  if (tail.length === 0) return anchorSpecs;
  const n = tail.length + anchorSpecs.length;
  const start = Math.max(1, Math.min(Math.floor(n / 2), n - anchorSpecs.length));
  const slots = Array.from({ length: n - start }, (_, i) => start + i);
  const chosen = new Set(seededShuffle(slots, `${seed}:anchors`).slice(0, anchorSpecs.length));
  const out: ItemSpec[] = [];
  let t = 0;
  let a = 0;
  for (let pos = 0; pos < n; pos++) out.push(chosen.has(pos) ? anchorSpecs[a++] : tail[t++]);
  return out;
}

/** Deterministic Fisher-Yates driven by `hashInt` -- no Math.random(). */
function seededShuffle<T>(items: T[], seed: string): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = hashInt(`${seed}:${i}`) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function contentKeyOf(item: ItemBankEntry): string {
  return item.content_key ?? `id:${item.item_id}`;
}

/**
 * Deterministically rotate an array using `seed` -- same seed always
 * produces the same rotation (reproducible for tests), different seeds
 * (e.g. successive rounds, which each get their own per-round seed from
 * `selectNext`) rotate differently, so repeat sessions stop serving the
 * same items in the same order. No `Math.random()` anywhere in this path.
 */
function rotate<T>(items: T[], seed: string): T[] {
  if (items.length <= 1) return items;
  const offset = hashInt(seed) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}
