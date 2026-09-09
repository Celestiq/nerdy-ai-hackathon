import { describe, it, expect } from "vitest";
import { ConceptGraph } from "../src/graph/loader.js";
import { GameRegistry, ItemBankRegistry } from "../src/registry/index.js";
import type { ConceptMetaLookup } from "../src/store/projector.js";
import { numberlineManifest, numberlineItems } from "../src/games/numberline/index.js";
import { fractionbarsManifest, fractionbarsItems, partitionItems } from "../src/games/fractionbars/index.js";
import { runCohort } from "../src/simulation/cohortRunner.js";
import { competent, misconceptionHolder, rapidGuesser, abandoner, wheelSpinner, strugglesOn, decayer } from "../src/simulation/profiles.js";
import { mulberry32, seedToInt } from "../src/simulation/rng.js";
import { selectNext } from "../src/engine/engine.js";

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

// Regression for the seeded-demo-cohort dead-end fixed in scripts/seed.ts +
// src/simulation/profiles.ts (see BACKLOG.md). Before that fix, three of
// the six demo profiles used a *uniform* misconceptionHolder/wheelSpinner
// (wrong on every concept served, not just the concept the misconception
// or struggle was meant to be about). On this graph's two roots
// (N.COUNT, G.PART), that meant a student could wheel-spin-block BOTH
// roots at once, which starves selectNext entirely ("every candidate was
// blocked by a hard constraint") -- and once that happens on the seeded
// demo cohort's very first live request, the child client has nothing to
// show. This locks in the fix: `targetConcepts` scoping on
// misconceptionHolder and the new `strugglesOn` profile, which are
// deliberately narrow (a fraction-only misconception, a single stuck
// concept) so the *other* root always stays open.
describe("seeded demo cohort: no candidate-starvation dead-end (BACKLOG.md)", () => {
  // Mirrors scripts/seed.ts's cohort config exactly (profiles + student
  // IDs + rounds + seed) so this test fails the same way the real seed
  // script's output did before the fix, and stays honest if seed.ts's
  // config ever drifts back toward a uniform profile.
  const demoStudentIds = ["stu_maya", "stu_devon", "stu_priya", "stu_jonah", "stu_amara", "stu_leo"];
  function demoCohort() {
    return [
      { id: "stu_maya", profile: misconceptionHolder("WHOLE_NUMBER_BIAS", { targetConcepts: ["F.MAG.CMP", "F.MAG.NONUNIT"] }) },
      { id: "stu_devon", profile: strugglesOn(["G.PART"]) },
      { id: "stu_priya", profile: competent },
      { id: "stu_jonah", profile: misconceptionHolder("WHOLE_NUMBER_BIAS", { targetConcepts: ["F.MAG.CMP", "F.MAG.NONUNIT"] }) },
      { id: "stu_amara", profile: decayer },
      { id: "stu_leo", profile: competent },
    ];
  }

  it("every seeded demo student can still get a playable assignment on their first live request after the seed script's simulated history", () => {
    const { registry, itemBank } = fullRegistry();
    const students = demoCohort();
    const { store } = runCohort({ graph, registry, itemBank, metaOf, students, rounds: 18, seed: "seed-cohort-v1" });

    // Replicates what a live "give me the next five minutes" request looks
    // like right after `npm run seed`: fresh selectNext call, seeded
    // belief, no mid-simulation state. This is exactly where 3 of 6
    // profiles used to come back with assignment: undefined.
    //
    // runCohort's default startDate anchors the *last* simulated round to
    // a fixed number of days before "now" (see cohortRunner.ts's
    // defaultStartDate / REVIEW_MARGIN_DAYS), not to a hardcoded calendar
    // date -- so "right now" (real wall-clock) is always the correct
    // stand-in for "moments after the seed script finished," regardless of
    // when this test actually runs.
    const rightAfterSeeding = new Date();
    for (const id of demoStudentIds) {
      const belief = store.belief(id, rightAfterSeeding);
      const result = selectNext({
        studentId: id,
        graph,
        belief,
        registry,
        itemBank,
        anchors: new Map(),
        seed: `post-seed-check:${id}`,
        now: rightAfterSeeding,
      });
      expect(result.assignment, `${id} got no assignment: ${result.reason}`).toBeDefined();
      expect(result.reason).not.toBe("every candidate was blocked by a hard constraint");
    }
  });

  it("reproduces the pre-fix starvation with the old uniform profiles, proving the scoped profiles above are what fixes it", () => {
    const { registry, itemBank } = fullRegistry();
    // The pre-fix shape: misconceptionHolder with no targetConcepts (wrong
    // on every concept served) and the uniform wheelSpinner in place of
    // devon's scoped strugglesOn(["G.PART"]).
    const students = [
      { id: "stu_maya", profile: misconceptionHolder("WHOLE_NUMBER_BIAS") },
      { id: "stu_devon", profile: wheelSpinner },
      { id: "stu_priya", profile: competent },
      { id: "stu_jonah", profile: misconceptionHolder("WHOLE_NUMBER_BIAS") },
      { id: "stu_amara", profile: decayer },
      { id: "stu_leo", profile: competent },
    ];
    const { trace } = runCohort({ graph, registry, itemBank, metaOf, students, rounds: 18, seed: "seed-cohort-v1" });

    const starvedIds = new Set(
      trace.filter((t) => t.blocked_reason === "every candidate was blocked by a hard constraint").map((t) => t.student_id),
    );
    // Same three students the manual curl testing found: whole-number-bias
    // holders plus the uniform wheel-spinner, never the two competent
    // learners or the decayer.
    expect(starvedIds).toEqual(new Set(["stu_maya", "stu_devon", "stu_jonah"]));
  });
});
