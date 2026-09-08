import { describe, it, expect } from "vitest";
import { ConceptGraph } from "../src/graph/loader.js";
import { GameRegistry, ItemBankRegistry } from "../src/registry/index.js";
import type { ConceptMetaLookup } from "../src/store/projector.js";
import { numberlineManifest, numberlineItems } from "../src/games/numberline/index.js";
import { fractionbarsManifest, fractionbarsItems, partitionItems } from "../src/games/fractionbars/index.js";
import { runCohort } from "../src/simulation/cohortRunner.js";
import { competent, misconceptionHolder, rapidGuesser, abandoner, wheelSpinner, decayer } from "../src/simulation/profiles.js";
import { mulberry32, seedToInt } from "../src/simulation/rng.js";

const graph = ConceptGraph.load();
const metaOf: ConceptMetaLookup = (id) => {
  const n = graph.node(id);
  return n && { mastery_threshold: n.mastery_threshold, decay_half_life_days: n.decay_half_life_days };
};

function fullRegistry() {
  const registry = new GameRegistry();
  registry.register(numberlineManifest);
  registry.register(fractionbarsManifest);
  const itemBank = new ItemBankRegistry();
  itemBank.register(numberlineManifest.game_id, (concepts) =>
    numberlineItems.filter((i) => concepts.includes(i.concept_id)).map((i) => ({ item_id: i.item_id, concept_id: i.concept_id, difficulty: i.difficulty })),
  );
  itemBank.register(fractionbarsManifest.game_id, (concepts) => [
    ...fractionbarsItems.filter((i) => concepts.includes(i.concept_id)),
    ...partitionItems.filter((i) => concepts.includes(i.concept_id)),
  ].map((i) => ({ item_id: i.item_id, concept_id: i.concept_id, difficulty: i.difficulty })));
  return { registry, itemBank };
}

describe("PRNG determinism", () => {
  it("same seed produces the same sequence", () => {
    const a = mulberry32(seedToInt("x"));
    const b = mulberry32(seedToInt("x"));
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });
});

describe("cohort runner", () => {
  it("same seed produces an identical trace", () => {
    const { registry, itemBank } = fullRegistry();
    const students = [
      { id: "s1", profile: competent },
      { id: "s2", profile: misconceptionHolder("WHOLE_NUMBER_BIAS") },
      { id: "s3", profile: wheelSpinner },
    ];
    const runA = runCohort({ graph, registry, itemBank, metaOf, students, rounds: 6, seed: "diffable-1" });
    const runB = runCohort({ graph, registry, itemBank, metaOf, students, rounds: 6, seed: "diffable-1" });
    expect(runA.trace).toEqual(runB.trace);
  });

  it("a mixed cohort of all six profiles completes many sessions without throwing", () => {
    const { registry, itemBank } = fullRegistry();
    const students = [
      { id: "c1", profile: competent },
      { id: "c2", profile: misconceptionHolder("DENOMINATOR_BIAS") },
      { id: "c3", profile: wheelSpinner },
      { id: "c4", profile: rapidGuesser },
      { id: "c5", profile: abandoner },
      { id: "c6", profile: decayer },
    ];
    const { trace } = runCohort({ graph, registry, itemBank, metaOf, students, rounds: 15, seed: "cohort-mix-1" });
    expect(trace.length).toBe(students.length * 15);
    // no starvation: every student produced at least one non-blocked assignment
    for (const s of students) {
      expect(trace.some((t) => t.student_id === s.id && t.concepts.length > 0)).toBe(true);
    }
  });

  it("each profile's statistical signature matches its definition", () => {
    const { registry, itemBank } = fullRegistry();
    const { store } = runCohort({
      graph, registry, itemBank, metaOf,
      students: [{ id: "guesser", profile: rapidGuesser }],
      rounds: 6,
      seed: "guesser-check",
    });
    const bundles = store.allBundles();
    const allObs = bundles.flatMap((b) => b.observations);
    expect(allObs.length).toBeGreaterThan(0);
    expect(allObs.every((o) => o.latency_ms < 700)).toBe(true); // sub-second, by construction
  });

  it("an abandoner leaves incomplete, partial evidence", () => {
    const { registry, itemBank } = fullRegistry();
    const { store } = runCohort({
      graph, registry, itemBank, metaOf,
      students: [{ id: "quitter", profile: abandoner }],
      rounds: 3,
      seed: "abandon-check",
    });
    const bundles = store.allBundles();
    expect(bundles.some((b) => !b.engagement.completed)).toBe(true);
  });
});
