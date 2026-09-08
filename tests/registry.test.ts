import { describe, it, expect } from "vitest";
import { GameRegistry } from "../src/registry/registry.js";
import { ConceptGraph } from "../src/graph/loader.js";

const graph = ConceptGraph.load();

const lineManifest = {
  game_id: "test.line.v1",
  assesses: { representations: ["NUMBER_LINE"], task_types: ["MAGNITUDE_PLACEMENT"] },
  grade_band: [3, 4],
  duration_s: { min: 60, max: 120 },
  items_per_session: { min: 2, max: 4 },
  reading_required: false,
  difficulty_range: [0.1, 0.9],
  signatures: ["WHOLE_NUMBER_BIAS"],
};

const areaManifest = {
  game_id: "test.area.v1",
  assesses: { representations: ["AREA_MODEL"], task_types: ["EQUIVALENCE"] },
  grade_band: [3, 4],
  duration_s: { min: 60, max: 120 },
  items_per_session: { min: 2, max: 4 },
  reading_required: false,
  difficulty_range: [0.1, 0.9],
  signatures: ["DENOMINATOR_BIAS"],
};

describe("GameRegistry", () => {
  it("rejects a malformed manifest with a reason", () => {
    const registry = new GameRegistry();
    const result = registry.register({ game_id: "bad" });
    expect(result.ok).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("rejects a manifest claiming a signature outside the closed registry", () => {
    const registry = new GameRegistry();
    const result = registry.register({ ...lineManifest, signatures: ["NOT_REAL"] });
    expect(result.ok).toBe(false);
  });

  it("matches two manifests with different capabilities to disjoint concept sets", () => {
    const registry = new GameRegistry();
    registry.register(lineManifest);
    registry.register(areaManifest);

    const lineOnly = registry.matchConcept(graph, "F.MAG.UNIT"); // NUMBER_LINE + MAGNITUDE_PLACEMENT
    const areaOnly = registry.matchConcept(graph, "F.EQV"); // AREA_MODEL + EQUIVALENCE

    expect(lineOnly.map((m) => m.game_id)).toEqual(["test.line.v1"]);
    expect(areaOnly.map((m) => m.game_id)).toEqual(["test.area.v1"]);
  });

  it("registers at runtime and is matchable without any code change", () => {
    const registry = new GameRegistry();
    expect(registry.matchConcept(graph, "F.MAG.UNIT")).toEqual([]);
    registry.register(lineManifest);
    expect(registry.matchConcept(graph, "F.MAG.UNIT").map((m) => m.game_id)).toEqual(["test.line.v1"]);
  });

  it("produces an accurate coverage report against a known graph and manifest set", () => {
    const registry = new GameRegistry();
    registry.register(lineManifest);
    const uncovered = registry.coverageReport(graph);
    expect(uncovered).toContain("F.EQV"); // AREA_MODEL/EQUIVALENCE, not covered by the line manifest
    expect(uncovered).not.toContain("F.MAG.UNIT");
  });
});
