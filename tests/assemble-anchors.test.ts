import { describe, it, expect } from "vitest";
import { ConceptGraph } from "../src/graph/loader.js";
import { GameRegistry, ItemBankRegistry, type ItemBankEntry } from "../src/registry/index.js";
import type { BeliefInternal } from "../src/store/types.js";
import { WHEEL_SPIN_LIMIT } from "../src/store/types.js";
import { selectNext } from "../src/engine/engine.js";
import { assembleAssignment } from "../src/engine/assemble.js";
import { numberlineManifest } from "../src/games/numberline/index.js";

/**
 * Cycle 18 B1: assembly serves what the engine chose. Anchors are fixed
 * cohort ITEMS (their concepts don't widen the adaptive tail), a STUCK
 * concept's anchor is skipped, and same-content items are deduped within a
 * session. Uses a fixture item bank (fake item ids, real graph concept ids)
 * so these tests don't depend on the live, still-changing item bank.
 */

const graph = ConceptGraph.load();

function fx(item_id: string, concept_id: string, difficulty: number, content_key?: string): ItemBankEntry {
  return { item_id, concept_id, difficulty, ...(content_key ? { content_key } : {}) };
}

const FIXTURE_ITEMS: ItemBankEntry[] = [
  fx("fx_ord_1", "N.ORD", 0.2, "ord-1"),
  fx("fx_ord_2", "N.ORD", 0.3, "ord-2"),
  fx("fx_ord_3", "N.ORD", 0.4, "ord-3"),
  fx("fx_ord_4", "N.ORD", 0.5, "ord-4"),
  fx("fx_unit_1", "F.MAG.UNIT", 0.5, "unit-1"),
  fx("fx_unit_2", "F.MAG.UNIT", 0.4, "unit-2"),
  fx("fx_unit_3", "F.MAG.UNIT", 0.3, "unit-3"),
  fx("fx_unit_4", "F.MAG.UNIT", 0.6, "unit-4"),
  fx("fx_dm_1", "D.MAG", 0.6, "place-0.125"),
  fx("fx_dm_2", "D.MAG", 0.5, "dm-2"),
  // Same content as the D.MAG anchor, authored under another concept.
  fx("fx_dc_1", "D.MAG.CMP", 0.65, "place-0.125"),
  fx("fx_dc_2", "D.MAG.CMP", 0.5, "dc-2"),
  fx("fx_dc_3", "D.MAG.CMP", 0.55, "dc-3"),
  // A tail-vs-tail duplicate pair inside one concept's pool.
  fx("fx_dc_4", "D.MAG.CMP", 0.6, "dc-3"),
  fx("fx_nc_1", "N.COUNT", 0.1, "nc-1"),
  fx("fx_nc_2", "N.COUNT", 0.15, "nc-2"),
  fx("fx_nc_3", "N.COUNT", 0.2, "nc-3"),
  fx("fx_nc_4", "N.COUNT", 0.25, "nc-4"),
];

const FIXTURE_ANCHORS = new Map<string, ItemBankEntry[]>([
  [numberlineManifest.game_id, [FIXTURE_ITEMS.find((i) => i.item_id === "fx_unit_1")!, FIXTURE_ITEMS.find((i) => i.item_id === "fx_dm_1")!]],
]);

function fixtureRegistry() {
  const registry = new GameRegistry();
  registry.register(numberlineManifest);
  const itemBank = new ItemBankRegistry();
  itemBank.register(numberlineManifest.game_id, (conceptIds) => FIXTURE_ITEMS.filter((i) => conceptIds.includes(i.concept_id)));
  return { registry, itemBank };
}

function contentKeys(itemIds: string[]): string[] {
  return itemIds.map((id) => {
    const item = FIXTURE_ITEMS.find((i) => i.item_id === id)!;
    return item.content_key ?? item.item_id;
  });
}

function belief(entries: Array<Partial<BeliefInternal> & { concept_id: string }>): Map<string, BeliefInternal> {
  return new Map(
    entries.map((e) => [
      e.concept_id,
      {
        student_id: "stu_fx",
        p_mastery: 0.5,
        confidence: 0.5,
        observations_n: 6,
        last_observed: "2026-09-15",
        p_decayed: 0.5,
        signatures: [],
        attempts_without_mastery: 0,
        status: "EMERGING",
        ...e,
      } as BeliefInternal,
    ]),
  );
}

describe("assembleAssignment: anchors are fixed items, the tail is only the chosen concepts", () => {
  it("does not widen the tail with unchosen anchor concepts", () => {
    const { registry, itemBank } = fixtureRegistry();
    for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
      const result = assembleAssignment(graph, registry, itemBank, ["N.ORD"], FIXTURE_ANCHORS, seed)!;
      expect(result).toBeDefined();
      expect(result.concepts).toEqual(["N.ORD"]);
      const tail = result.item_specs.filter((s) => !s.is_anchor);
      expect(tail.length).toBeGreaterThan(0);
      for (const s of tail) expect(s.concept_id).toBe("N.ORD");
      expect(result.item_specs.filter((s) => s.is_anchor).map((s) => s.item_id)).toEqual(["fx_unit_1", "fx_dm_1"]);
      expect(result.anchorConcepts).toEqual(["F.MAG.UNIT", "D.MAG"]);
      // included concepts get at least half the session
      const included = result.item_specs.filter((s) => result.concepts.includes(s.concept_id)).length;
      expect(included * 2).toBeGreaterThanOrEqual(result.item_specs.length);
    }
  });

  it("skips an anchor whose concept is STUCK and reports it as skipped", () => {
    const { registry, itemBank } = fixtureRegistry();
    const result = assembleAssignment(graph, registry, itemBank, ["N.ORD"], FIXTURE_ANCHORS, "s1", undefined, new Set(["D.MAG"]))!;
    expect(result.item_specs.some((s) => s.concept_id === "D.MAG")).toBe(false);
    expect(result.skippedAnchors.map((a) => a.item_id)).toEqual(["fx_dm_1"]);
    expect(result.anchorConcepts).toEqual(["F.MAG.UNIT"]);
  });
});

describe("assembleAssignment: within-session dedupe by content key", () => {
  it("never serves the same content twice, anchor content winning over a same-content tail item", () => {
    const { registry, itemBank } = fixtureRegistry();
    for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const result = assembleAssignment(graph, registry, itemBank, ["D.MAG.CMP"], FIXTURE_ANCHORS, seed)!;
      const ids = result.item_specs.map((s) => s.item_id);
      const keys = contentKeys(ids);
      expect(new Set(keys).size, `seed ${seed}: ${ids.join(",")}`).toBe(keys.length);
      expect(ids).toContain("fx_dm_1"); // the anchor stays
      expect(ids).not.toContain("fx_dc_1"); // its same-content twin is dropped
      // exactly one of the tail-vs-tail pair
      expect(ids.filter((id) => id === "fx_dc_3" || id === "fx_dc_4")).toHaveLength(1);
      expect(ids).toContain("fx_dc_2");
    }
  });

  it("resolves an anchor's content key from the item bank when the anchor entry itself has none", () => {
    const { registry, itemBank } = fixtureRegistry();
    // Production anchors are configured as bare {item_id, concept_id, difficulty}.
    const bareAnchors = new Map<string, ItemBankEntry[]>([
      [numberlineManifest.game_id, [fx("fx_unit_1", "F.MAG.UNIT", 0.5), fx("fx_dm_1", "D.MAG", 0.6)]],
    ]);
    for (const seed of ["a", "b", "c", "d"]) {
      const ids = assembleAssignment(graph, registry, itemBank, ["D.MAG.CMP"], bareAnchors, seed)!.item_specs.map((s) => s.item_id);
      expect(ids).toContain("fx_dm_1");
      expect(ids).not.toContain("fx_dc_1");
    }
  });

  it("an entry without a content_key is only deduped against itself (falls back to item_id)", () => {
    const registry = new GameRegistry();
    registry.register(numberlineManifest);
    const itemBank = new ItemBankRegistry();
    const plain = [fx("p1", "N.ORD", 0.2), fx("p2", "N.ORD", 0.3), fx("p3", "N.ORD", 0.4)];
    itemBank.register(numberlineManifest.game_id, (ids) => plain.filter((i) => ids.includes(i.concept_id)));
    const result = assembleAssignment(graph, registry, itemBank, ["N.ORD"], new Map(), "x")!;
    expect(result.item_specs.map((s) => s.item_id).sort()).toEqual(["p1", "p2", "p3"]);
  });
});

describe("selectNext: served concepts and the decision log agree", () => {
  const stuckBelief = () =>
    belief([
      { concept_id: "N.COUNT", p_mastery: 0.95, status: "MASTERED" },
      { concept_id: "D.MAG", p_mastery: 0.2, attempts_without_mastery: WHEEL_SPIN_LIMIT, status: "STUCK" },
    ]);

  it("never serves a STUCK concept through its anchor, and logs the skip", () => {
    const { registry, itemBank } = fixtureRegistry();
    for (const seed of ["r1", "r2", "r3", "r4"]) {
      const out = selectNext({ studentId: "stu_fx", graph, belief: stuckBelief(), registry, itemBank, anchors: FIXTURE_ANCHORS, seed });
      expect(out.escalations).toContain("D.MAG");
      expect(out.assignment, out.reason).toBeDefined();
      const a = out.assignment!;
      expect(a.concepts).not.toContain("D.MAG");
      expect(a.item_specs.some((s) => s.concept_id === "D.MAG")).toBe(false);
      expect(out.decisionLog.some((d) => d.concept_id === "D.MAG" && !d.included && d.reason === "anchor skipped: stuck")).toBe(true);
    }
  });

  it("every served concept appears in decision_log as included, with a true reason for anchors", () => {
    const { registry, itemBank } = fixtureRegistry();
    for (const seed of ["r1", "r2", "r3", "r4"]) {
      const out = selectNext({ studentId: "stu_fx", graph, belief: stuckBelief(), registry, itemBank, anchors: FIXTURE_ANCHORS, seed });
      const a = out.assignment!;
      for (const concept of new Set(a.item_specs.map((s) => s.concept_id))) {
        const entries = out.decisionLog.filter((d) => d.concept_id === concept && d.included);
        expect(entries, `served concept ${concept} missing an included decision_log entry`).toHaveLength(1);
        // served only via its anchor -> the reason says so
        const adaptive = a.item_specs.some((s) => s.concept_id === concept && !s.is_anchor);
        if (!adaptive) expect(entries[0].reason.startsWith("anchor (fixed cohort item)")).toBe(true);
        // and it never ALSO sits under "not chosen"
        expect(out.decisionLog.some((d) => d.concept_id === concept && !d.included)).toBe(false);
      }
      // Non-anchor items only ever come from the engine's chosen concepts.
      for (const s of a.item_specs.filter((x) => !x.is_anchor)) expect(a.concepts).toContain(s.concept_id);
      const included = a.item_specs.filter((s) => a.concepts.includes(s.concept_id)).length;
      expect(included * 2).toBeGreaterThanOrEqual(a.item_specs.length);
    }
  });
});
