import { describe, it, expect } from "vitest";
import { ConceptGraph } from "../src/graph/loader.js";
import { validateGraph } from "../src/graph/validate.js";
import { frontier, blame, path, coverage, matchesCapability, type BeliefLookup } from "../src/graph/query.js";
import type { ConceptGraphData } from "../src/graph/types.js";
import { numberlineItems } from "../src/games/numberline/items.js";
import { fractionbarsItems, partitionItems } from "../src/games/fractionbars/items.js";

const graph = ConceptGraph.load();

describe("structural validation", () => {
  it("the shipped graph passes its own structural validation", () => {
    const result = validateGraph(graph.data);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("every referenced concept and signature exists", () => {
    for (const e of graph.data.requires) {
      expect(graph.node(e.from)).toBeDefined();
      expect(graph.node(e.to)).toBeDefined();
    }
    for (const e of graph.data.explains) {
      expect(graph.node(e.at)).toBeDefined();
      expect(graph.node(e.blames)).toBeDefined();
    }
  });

  it("rejects a graph with a requires cycle", () => {
    const broken: ConceptGraphData = {
      version: "test",
      nodes: [
        { concept_id: "A.ONE", label: "a", strand: "S", grade_band: [1, 1], representations: [], task_types: [], mastery_threshold: 0.8, decay_half_life_days: 10, status: "stub" },
        { concept_id: "B.TWO", label: "b", strand: "S", grade_band: [1, 1], representations: [], task_types: [], mastery_threshold: 0.8, decay_half_life_days: 10, status: "stub" },
      ],
      requires: [
        { from: "A.ONE", to: "B.TWO", strength: "hard" },
        { from: "B.TWO", to: "A.ONE", strength: "hard" },
      ],
      explains: [],
    };
    const result = validateGraph(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("cycle"))).toBe(true);
  });

  it("rejects an explains edge with an unknown signature or missing provenance", () => {
    const broken: ConceptGraphData = {
      version: "test",
      nodes: [{ concept_id: "A.ONE", label: "a", strand: "S", grade_band: [1, 1], representations: [], task_types: [], mastery_threshold: 0.8, decay_half_life_days: 10, status: "stub" }],
      requires: [],
      explains: [{ at: "A.ONE", signature: "NOT_REAL", blames: "A.ONE", weight: 0.5, provenance: "" }],
    };
    const result = validateGraph(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("unknown signature"))).toBe(true);
    expect(result.errors.some((e) => e.includes("missing provenance"))).toBe(true);
  });
});

describe("frontier()", () => {
  it("excludes concepts with unmet hard prerequisites", () => {
    const empty: BeliefLookup = () => undefined;
    const front = frontier(graph, empty);
    expect(front).not.toContain("F.MAG.UNIT"); // needs F.NOTATE <- G.PART, unmet from zero belief
    expect(front).toContain("N.COUNT"); // no hard prereqs at all
  });

  it("includes a concept once its hard prerequisites are met, and stops once it's mastered", () => {
    const belief = new Map<string, { p_mastery: number }>([
      ["N.COUNT", { p_mastery: 0.95 }],
      ["G.PART", { p_mastery: 0.95 }],
    ]);
    const lookup: BeliefLookup = (id) => belief.get(id);
    const front = frontier(graph, lookup);
    expect(front).toContain("N.ORD"); // hard prereq N.COUNT now met
    expect(front).toContain("F.NOTATE"); // hard prereq G.PART now met
    expect(front).not.toContain("N.COUNT"); // already mastered
  });

  it("a supporting-only prerequisite does not block the frontier", () => {
    // F.MAG.CMP requires F.MAG.UNIT (hard) and N.MAG (supporting).
    const belief = new Map<string, { p_mastery: number }>([["F.MAG.UNIT", { p_mastery: 0.95 }]]);
    const lookup: BeliefLookup = (id) => belief.get(id);
    expect(frontier(graph, lookup)).toContain("F.MAG.CMP");
  });
});

describe("blame()", () => {
  it("returns the documented root cause for the worked example", () => {
    const suspects = blame(graph, "F.MAG.CMP", "WHOLE_NUMBER_BIAS");
    expect(suspects[0]?.concept_id).toBe("F.MAG.UNIT");
    expect(suspects[0]?.provenance).toBeTruthy();
  });

  it("returns nothing for a signature that isn't wired to that concept", () => {
    expect(blame(graph, "N.COUNT", "LONGER_IS_LARGER")).toEqual([]);
  });
});

describe("path()", () => {
  it("returns an ordered prerequisite-respecting route", () => {
    const route = path(graph, "N.COUNT", "N.MAG");
    expect(route[0]).toBe("N.COUNT");
    expect(route[route.length - 1]).toBe("N.MAG");
    expect(route).toContain("N.ORD");
  });

  it("returns an empty route when no path exists", () => {
    expect(path(graph, "D.MAG", "N.COUNT")).toEqual([]);
  });
});

describe("item coverage", () => {
  it("every 'authored' concept has at least one item in a real item bank", () => {
    // The three exported item-bank arrays in the repo today -- if a fourth
    // game bank is ever added, it must be added to this list too, or this
    // test silently stops catching the "metadata claims coverage that
    // doesn't exist" bug class (the exact bug D.NOTATE, then N.PLACE/
    // N.PLACE.HTH, both had for several cycles before being authored).
    const allItemConceptIds = new Set<string>([
      ...numberlineItems.map((i) => i.concept_id),
      ...fractionbarsItems.map((i) => i.concept_id),
      ...partitionItems.map((i) => i.concept_id),
    ]);
    const authoredNodes = graph.data.nodes.filter((n) => n.status === "authored");
    expect(authoredNodes.length).toBeGreaterThan(0);
    for (const node of authoredNodes) {
      expect(allItemConceptIds.has(node.concept_id)).toBe(true);
    }
  });
});

describe("coverage() / matchesCapability()", () => {
  it("matches on capability, not on a game name", () => {
    const numberlineLike = {
      game_id: "fake.game.v1",
      assesses: { representations: ["NUMBER_LINE" as const], task_types: ["MAGNITUDE_PLACEMENT" as const] },
      grade_band: [3, 4] as [number, number],
      duration_s: { min: 60, max: 120 },
      items_per_session: { min: 2, max: 4 },
      reading_required: false,
      difficulty_range: [0.1, 0.9] as [number, number],
      signatures: ["WHOLE_NUMBER_BIAS" as const],
    };
    const node = graph.node("F.MAG.UNIT")!;
    expect(matchesCapability(node, numberlineLike)).toBe(true);
    expect(coverage(graph, "F.MAG.UNIT", [numberlineLike])).toContain("fake.game.v1");
    expect(coverage(graph, "F.MAG.UNIT", [])).toEqual([]);
  });
});
