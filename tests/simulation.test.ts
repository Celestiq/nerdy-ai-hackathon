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
import { WHEEL_SPIN_LIMIT } from "../src/store/types.js";

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

  // Historical note: this scenario (uniform misconceptionHolder/wheelSpinner
  // with no targetConcepts) used to be the reproduction case for the
  // candidate-starvation dead-end above -- stu_maya/stu_devon/stu_jonah
  // wheel-spin-blocked on BOTH of this graph's roots at once and got
  // `assignment: undefined` ("every candidate was blocked by a hard
  // constraint") forever after. The scoped profiles above (targetConcepts /
  // strugglesOn) fix that specific seeded-demo scenario by keeping one root
  // open. But the underlying engine defect -- selectNext had no fallback at
  // all when applyHardConstraints() returns zero survivors -- was real and
  // independent of which profiles happened to trigger it: `npm run simulate
  // -- 30 42`'s wider 7-persona cohort hit the exact same zero-candidate
  // dead-end from round 6 onward (58% of all session attempts starved; see
  // BACKLOG.md). That's fixed at the source now: src/engine/constraints.ts's
  // applyHardConstraints() relaxes exactly one wheel-spin-blocked candidate
  // (highest score, ties by longest-blocked) whenever the normal pass
  // survives nothing, so this same uniform-profile scenario no longer
  // starves at all. The two tests below replace the old
  // "starvation is expected" assertion with a guard against it regressing.
  it("the old starvation-reproduction scenario no longer starves: the wheel-spin relaxation fallback keeps every student playable", () => {
    const { registry, itemBank } = fullRegistry();
    const students = [
      { id: "stu_maya", profile: misconceptionHolder("WHOLE_NUMBER_BIAS") },
      { id: "stu_devon", profile: wheelSpinner },
      { id: "stu_priya", profile: competent },
      { id: "stu_jonah", profile: misconceptionHolder("WHOLE_NUMBER_BIAS") },
      { id: "stu_amara", profile: decayer },
      { id: "stu_leo", profile: competent },
    ];
    const { trace } = runCohort({ graph, registry, itemBank, metaOf, students, rounds: 18, seed: "seed-cohort-v1" });

    // WHEEL_SPIN_LIMIT is 3: a candidate only becomes wheel-spin-blocked
    // after 3 failed attempts, and the fallback relaxes exactly one blocked
    // candidate the moment survivors would otherwise be zero -- so no
    // student should ever be starved for more than a single consecutive
    // round (a transient round where a still-open, non-wheel-spin candidate
    // existed is fine; back-to-back-to-back true dead-ends, the old bug,
    // are not).
    const MAX_CONSECUTIVE_STARVED_ROUNDS = 1;
    for (const s of students) {
      const rows = trace.filter((t) => t.student_id === s.id).sort((a, b) => a.round - b.round);
      let run = 0;
      for (const r of rows) {
        run = r.blocked_reason === "every candidate was blocked by a hard constraint" ? run + 1 : 0;
        expect(run, `${s.id} hit ${run} consecutive starved rounds around round ${r.round}`).toBeLessThanOrEqual(MAX_CONSECUTIVE_STARVED_ROUNDS);
      }
    }
  });

  it("when the fallback relaxes a wheel-spin block, the decision_log records it explicitly and auditably", () => {
    const { registry, itemBank } = fullRegistry();
    const students = [
      { id: "stu_maya", profile: misconceptionHolder("WHOLE_NUMBER_BIAS") },
      { id: "stu_devon", profile: wheelSpinner },
      { id: "stu_priya", profile: competent },
      { id: "stu_jonah", profile: misconceptionHolder("WHOLE_NUMBER_BIAS") },
      { id: "stu_amara", profile: decayer },
      { id: "stu_leo", profile: competent },
    ];
    // Same cohort + seed as above, run to the same round count, then take
    // one more live "give me the next five minutes" request per student --
    // exactly the shape a real client call makes (see the "post-seed check"
    // test above). By this point stu_maya/stu_devon/stu_jonah are
    // wheel-spin-blocked on G.PART (the only other root) and would have
    // gotten `assignment: undefined` before this fix.
    const { store } = runCohort({ graph, registry, itemBank, metaOf, students, rounds: 18, seed: "seed-cohort-v1" });
    const now = new Date();

    for (const id of ["stu_maya", "stu_devon", "stu_jonah"]) {
      const belief = store.belief(id, now);
      const result = selectNext({ studentId: id, graph, belief, registry, itemBank, anchors: new Map(), seed: `relax-audit:${id}`, now });

      expect(result.assignment, `${id} got no assignment: ${result.reason}`).toBeDefined();

      const blockedEntry = result.decisionLog.find((d) => d.reason.startsWith("wheel-spin block:"));
      const relaxedEntry = result.decisionLog.find((d) => d.reason === "wheel-spin relaxed: no other candidate available");
      expect(blockedEntry, `${id}: expected a wheel-spin-blocked candidate in the decision log`).toBeDefined();
      expect(relaxedEntry, `${id}: expected the relaxed candidate to be logged, not silent`).toBeDefined();
      expect(relaxedEntry!.included).toBe(true);
      // Same assignment surfaces in the contract's own decision_log, not just the engine's internal return value.
      expect(result.assignment!.decision_log).toEqual(result.decisionLog);
    }
  });

  // Cycle 14 gap #2 regression coverage: the starvation fallback used to
  // always relax the highest-scoring wheel-spin-blocked candidate, so a
  // student blocked on both roots at once (N.COUNT, G.PART -- exactly
  // stu_maya/stu_devon/stu_jonah above) got the *same* one relaxed every
  // round -- live-verified 12/12 consecutive sessions for stu_devon.
  // Continue driving stu_devon (wheelSpinner: reliably wrong, so it never
  // escapes wheel-spin-block on whichever concept gets relaxed) through
  // many more rounds and assert the relaxed concept actually alternates.
  it("when a student is wheel-spin-blocked on 2+ concepts at once, the relaxation fallback rotates between them instead of always picking the same one", () => {
    const { registry, itemBank } = fullRegistry();
    const students = [
      { id: "stu_maya", profile: misconceptionHolder("WHOLE_NUMBER_BIAS") },
      { id: "stu_devon", profile: wheelSpinner },
      { id: "stu_priya", profile: competent },
      { id: "stu_jonah", profile: misconceptionHolder("WHOLE_NUMBER_BIAS") },
      { id: "stu_amara", profile: decayer },
      { id: "stu_leo", profile: competent },
    ];
    const { store } = runCohort({ graph, registry, itemBank, metaOf, students, rounds: 18, seed: "seed-cohort-v1" });

    // stu_devon is wheel-spin-blocked on both N.COUNT and G.PART by round
    // 18 (asserted by the sibling test above); confirm that here too so
    // this test fails loudly, not silently, if the seeded setup ever drifts.
    const beliefAt18 = store.belief("stu_devon");
    expect(beliefAt18.get("N.COUNT")?.attempts_without_mastery).toBeGreaterThanOrEqual(WHEEL_SPIN_LIMIT);
    expect(beliefAt18.get("G.PART")?.attempts_without_mastery).toBeGreaterThanOrEqual(WHEEL_SPIN_LIMIT);

    const relaxedSequence: string[] = [];
    let now = new Date();
    const EXTRA_ROUNDS = 12;
    for (let i = 0; i < EXTRA_ROUNDS; i++) {
      now = new Date(now.getTime() + 3 * 86_400_000);
      const belief = store.belief("stu_devon", now);
      const result = selectNext({ studentId: "stu_devon", graph, belief, registry, itemBank, anchors: new Map(), seed: `rotation-check:${i}`, now });
      expect(result.assignment, `round ${i}: expected an assignment, got: ${result.reason}`).toBeDefined();
      const relaxedEntry = result.decisionLog.find((d) => d.reason === "wheel-spin relaxed: no other candidate available");
      expect(relaxedEntry, `round ${i}: expected a relaxed candidate`).toBeDefined();
      relaxedSequence.push(relaxedEntry!.concept_id);

      const rng = mulberry32(seedToInt(`rotation-check-rng:${i}`));
      store.ingest(wheelSpinner(result.assignment!, { rng, simulatedAtMs: now.getTime(), sessionSeq: 18 + i }));
    }

    // The core Cycle 14 gap #2 fix: not the same concept every round.
    expect(new Set(relaxedSequence).size).toBeGreaterThan(1);

    // No more than one consecutive repeat -- true rotation, not just
    // "eventually switches after a long streak" (the old, still-buggy
    // behavior this test would otherwise still pass under).
    let maxStreak = 1;
    let curStreak = 1;
    for (let i = 1; i < relaxedSequence.length; i++) {
      curStreak = relaxedSequence[i] === relaxedSequence[i - 1] ? curStreak + 1 : 1;
      maxStreak = Math.max(maxStreak, curStreak);
    }
    expect(maxStreak, `relaxed sequence: ${relaxedSequence.join(",")}`).toBeLessThanOrEqual(1);
  });
});
