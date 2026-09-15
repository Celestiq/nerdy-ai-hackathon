import { describe, it, expect } from "vitest";
import { ConceptGraph } from "../src/graph/loader.js";
import { GameRegistry, ItemBankRegistry, type ItemBankEntry } from "../src/registry/index.js";
import type { BeliefInternal } from "../src/store/types.js";
import { WHEEL_SPIN_LIMIT } from "../src/store/types.js";
import { selectNext } from "../src/engine/engine.js";
import { assembleAssignment } from "../src/engine/assemble.js";
import { prereqsMet } from "../src/engine/constraints.js";
import { numberlineManifest } from "../src/games/numberline/index.js";

/**
 * Cycle 18 B1: assembly serves what the engine chose. Anchors are fixed
 * cohort ITEMS (their concepts don't widen the adaptive tail), a STUCK
 * concept's anchor is skipped, and same-content items are deduped within a
 * session. Cycle 19 lane G: anchors sit in the back half (never first), the
 * top chosen concept gets ceil(remaining/2) tail slots and opens the session,
 * a MASTERED concept never leads while a chosen concept is unmastered, and
 * the prerequisite gate is status-based. Uses a fixture item bank (fake item ids, real graph concept ids)
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

describe("assembleAssignment: session order (Cycle 19 lane G)", () => {
  const SEEDS = ["o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8", "o9", "o10"];

  it("never opens with an anchor; anchors land in the back half at seed-chosen positions", () => {
    const { registry, itemBank } = fixtureRegistry();
    const positions = new Set<string>();
    for (const chosen of [["N.ORD"], ["N.COUNT", "N.ORD"], ["D.MAG.CMP", "N.ORD"]]) {
      for (const seed of SEEDS) {
        const specs = assembleAssignment(graph, registry, itemBank, chosen, FIXTURE_ANCHORS, seed)!.item_specs;
        expect(specs[0].is_anchor, `${chosen}/${seed}`).toBe(false);
        expect(specs[0].concept_id).toBe(chosen[0]);
        const anchorIdx = specs.flatMap((s, i) => (s.is_anchor ? [i] : []));
        expect(anchorIdx).toHaveLength(2);
        for (const i of anchorIdx) expect(i).toBeGreaterThanOrEqual(Math.floor(specs.length / 2));
        // configured anchor order is preserved
        expect(specs.filter((s) => s.is_anchor).map((s) => s.item_id)).toEqual(["fx_unit_1", "fx_dm_1"]);
        positions.add(`${specs.length}:${anchorIdx.join(",")}`);
      }
    }
    expect(positions.size).toBeGreaterThan(3); // seeded, not one fixed slot
  });

  it("gives the top concept ceil(remaining/2) tail slots, interleaved and leading", () => {
    const { registry, itemBank } = fixtureRegistry();
    const remaining = numberlineManifest.items_per_session.max - 2; // two anchors
    for (const seed of SEEDS) {
      const specs = assembleAssignment(graph, registry, itemBank, ["N.COUNT", "N.ORD"], FIXTURE_ANCHORS, seed)!.item_specs;
      const tail = specs.filter((s) => !s.is_anchor).map((s) => s.concept_id);
      expect(tail.filter((c) => c === "N.COUNT")).toHaveLength(Math.ceil(remaining / 2));
      expect(tail.filter((c) => c === "N.ORD")).toHaveLength(remaining - Math.ceil(remaining / 2));
      // interleaved: never two of the same concept in a row while both have items left
      expect(tail.slice(0, 8)).toEqual(["N.COUNT", "N.ORD", "N.COUNT", "N.ORD", "N.COUNT", "N.ORD", "N.COUNT", "N.ORD"]);
    }
  });

  it("caps the top share at its deduped pool and backfills from the other concept", () => {
    const { registry, itemBank } = fixtureRegistry();
    for (const seed of SEEDS) {
      // D.MAG.CMP has 2 servable items (one is the anchor's twin, two share content).
      const specs = assembleAssignment(graph, registry, itemBank, ["D.MAG.CMP", "N.ORD"], FIXTURE_ANCHORS, seed)!.item_specs;
      const tail = specs.filter((s) => !s.is_anchor).map((s) => s.concept_id);
      expect(tail.filter((c) => c === "D.MAG.CMP")).toHaveLength(2);
      expect(tail.filter((c) => c === "N.ORD")).toHaveLength(4);
      expect(tail[0]).toBe("D.MAG.CMP");
    }
  });

  it("never gives the top concept zero items when another chosen concept has a deep pool", () => {
    const { registry, itemBank } = fixtureRegistry();
    for (const seed of SEEDS) {
      const specs = assembleAssignment(graph, registry, itemBank, ["N.ORD", "N.COUNT"], new Map(), seed)!.item_specs;
      expect(specs.filter((s) => s.concept_id === "N.ORD").length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("selectNext: a MASTERED concept never leads while a chosen concept is unmastered", () => {
  it("puts the unmastered chosen concept first even when the MASTERED one out-scores it", () => {
    const registry = new GameRegistry();
    registry.register(numberlineManifest);
    const itemBank = new ItemBankRegistry();
    const items = [
      fx("fx_dn_1", "D.NOTATE", 0.3), fx("fx_dn_2", "D.NOTATE", 0.4), fx("fx_dn_3", "D.NOTATE", 0.5),
      fx("fx_ord_1", "N.ORD", 0.2), fx("fx_ord_2", "N.ORD", 0.3), fx("fx_ord_3", "N.ORD", 0.4),
    ];
    itemBank.register(numberlineManifest.game_id, (ids) => items.filter((i) => ids.includes(i.concept_id)));
    const b = belief([
      { concept_id: "N.COUNT", p_mastery: 0.95, status: "MASTERED" },
      { concept_id: "N.PLACE.HTH", p_mastery: 0.95, status: "MASTERED" },
      // hysteresis-held: under threshold (so on the frontier), still MASTERED, low confidence -> scores high
      { concept_id: "D.NOTATE", p_mastery: 0.8, confidence: 0.05, status: "MASTERED" },
      { concept_id: "N.ORD", p_mastery: 0.5, confidence: 0.95, status: "EMERGING" },
    ]);
    for (const seed of ["m1", "m2", "m3"]) {
      const out = selectNext({ studentId: "stu_fx", graph, belief: b, registry, itemBank, anchors: new Map(), seed });
      const a = out.assignment!;
      expect(a, out.reason).toBeDefined();
      expect(a.concepts).toEqual(["N.ORD", "D.NOTATE"]);
      expect(a.item_specs[0].concept_id).toBe("N.ORD");
    }
  });
});

describe("prereqsMet: one status-based prerequisite predicate", () => {
  it("a hard prerequisite is met iff it is MASTERED or DECAYED, regardless of p_mastery", () => {
    const over = graph.node("N.COUNT")!.mastery_threshold + 0.05;
    expect(prereqsMet(graph, belief([{ concept_id: "N.COUNT", p_mastery: over, status: "EMERGING" }]), "N.ORD")).toBe(false);
    expect(prereqsMet(graph, belief([{ concept_id: "N.COUNT", p_mastery: 0.6, status: "DECAYED" }]), "N.ORD")).toBe(true);
    expect(prereqsMet(graph, belief([{ concept_id: "N.COUNT", p_mastery: 0.8, status: "MASTERED" }]), "N.ORD")).toBe(true);
    expect(prereqsMet(graph, belief([{ concept_id: "N.COUNT", p_mastery: 0.2, status: "STUCK" }]), "N.ORD")).toBe(false);
    expect(prereqsMet(graph, new Map(), "N.ORD")).toBe(false);
    expect(prereqsMet(graph, new Map(), "N.COUNT")).toBe(true); // root
  });
});
