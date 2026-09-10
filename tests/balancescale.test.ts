import { describe, it, expect } from "vitest";
import { graph, registry, itemBank, anchors, metaOf } from "../server/state.js";
import { assembleAssignment } from "../src/engine/assemble.js";
import { selectNext } from "../src/engine/engine.js";
import { LearnerStore } from "../src/store/store.js";
import { runCohort } from "../src/simulation/cohortRunner.js";
import { competent, misconceptionHolder, strugglesOn, decayer } from "../src/simulation/profiles.js";
import { buildObservation } from "../src/sdk/observation.js";
import type { EvidenceBundle } from "../src/contracts/schemas.js";
import { GameRegistry } from "../src/registry/index.js";

/**
 * Regression guard for F.EQV resolving to balancescale.compare.v1.
 *
 * balancescaleManifest is registered BEFORE fractionbarsManifest in
 * server/state.ts. That ordering used to matter for breaking a games[0]
 * capability-match tie on F.EQV: both manifests declared "EQUIVALENCE" as a
 * task type (fractionbars via AREA_MODEL, balancescale via BALANCE_SCALE).
 * Fractionbars' two F.EQV items turned out to be defective -- one had a
 * false answer key, since a genuinely-equivalent pair has no correct side
 * under a "which is bigger" mechanic -- and were deleted rather than fixed;
 * fractionbars' manifest no longer declares "EQUIVALENCE" as a task type at
 * all (see src/games/fractionbars/manifest.ts). So fractionbars no longer
 * capability-matches F.EQV at all, and the registration order is no longer
 * doing tie-breaking work for this concept. This test is kept as a
 * regression guard regardless: a future accidental re-widening of
 * fractionbars' task_types, or a new game claiming F.EQV's representation,
 * should fail this test, not just a manual live-check.
 *
 * Exercises the real production registry/itemBank/graph wiring from
 * server/state.ts (not a synthetic test-only registry, unlike
 * tests/registry.test.ts's manifests), same discipline tests/routes.test.ts
 * already uses for this file.
 */
describe("Balance Scale registration order", () => {
  it("resolves F.EQV to balancescale.compare.v1, not fractionbars.compare.v1", () => {
    const result = assembleAssignment(graph, registry, itemBank, ["F.EQV"], anchors, "test-seed-1");
    expect(result).toBeDefined();
    expect(result!.game_id).toBe("balancescale.compare.v1");
    expect(result!.item_specs.length).toBeGreaterThan(0);
  });

  it("leaves G.PART and F.NOTATE resolving to their existing games, unaffected", () => {
    // G.PART: AREA_MODEL + PARTITION -- balancescale doesn't declare
    // PARTITION as a task type, so it never enters this concept's match set.
    const part = assembleAssignment(graph, registry, itemBank, ["G.PART"], anchors, "test-seed-2");
    expect(part).toBeDefined();
    expect(part!.game_id).toBe("fractionbars.compare.v1");

    // F.NOTATE: AREA_MODEL + PARTITION -- same reasoning as G.PART.
    const notate = assembleAssignment(graph, registry, itemBank, ["F.NOTATE"], anchors, "test-seed-3");
    expect(notate).toBeDefined();
    expect(notate!.game_id).toBe("fractionbars.compare.v1");
  });

  it("routes F.MAG.CMP to fractionbars.compare.v1, the game that actually holds F.MAG.CMP items", () => {
    // F.MAG.CMP capability-matches BOTH numberline.place.v2 (NUMBER_LINE +
    // COMPARISON) and fractionbars.compare.v1 (AREA_MODEL + COMPARISON) --
    // but numberline's item bank has zero authored F.MAG.CMP items (every
    // F.MAG.CMP item lives in fractionbars/items.ts). assembleAssignment's
    // game-selection loop (src/engine/assemble.ts) requires the actual item
    // pool to be non-empty -- the same "isCovered" standard
    // src/engine/candidates.ts uses -- not just a capability match, so a
    // solo F.MAG.CMP request no longer resolves to a game with nothing to
    // serve it. Flagging explicitly: this is a real, intentional behavior
    // change uncovered while building the chosenConcepts[0] policy this file
    // guards (previously it resolved to numberline.place.v2, which only
    // produced an assignment at all because the two unrelated numberline
    // anchor items -- F.MAG.UNIT, D.MAG -- got attached regardless).
    const cmp = assembleAssignment(graph, registry, itemBank, ["F.MAG.CMP"], anchors, "test-seed-4");
    expect(cmp).toBeDefined();
    expect(cmp!.game_id).toBe("fractionbars.compare.v1");
    expect(cmp!.item_specs.some((i) => i.concept_id === "F.MAG.CMP")).toBe(true);
  });

  it("registers balancescale.compare.v1 as the sole capability match for F.EQV", () => {
    const matches = registry.matchConcept(graph, "F.EQV").map((m) => m.game_id);
    expect(matches).toEqual(["balancescale.compare.v1"]); // fractionbars no longer declares EQUIVALENCE
  });
});

/**
 * The real reachability guard: does a real student's real belief state,
 * pushed through the real frontier -> selectNext -> assembleAssignment
 * pipeline, actually land on balancescale.compare.v1? A hand-written solo
 * ["F.EQV"] concept list (what this file used to assert against) is not
 * something selectNext() ever produces under VARIETY_LIMIT=2 -- see
 * BACKLOG.md's Cycle 11 gap #3 ("looked fixed, wasn't guarded"). This test
 * drives the actual engine instead, for the same stu_priya F.MAG.NONUNIT
 * bootstrap scripts/seed.ts uses to make F.EQV's hard prerequisite
 * (F.MAG.NONUNIT >= 0.85 p_mastery) reachable at all.
 *
 * Mirrors scripts/seed.ts's base cohort simulation (profiles/seed/rounds)
 * plus its stu_priya F.MAG.NONUNIT bootstrap bundle exactly -- same
 * duplication discipline tests/simulation.test.ts's demoCohort() already
 * uses for this file, so this test fails the same way a live post-seed
 * request would if either drifts, rather than silently going stale.
 */
describe("F.EQV/balancescale.compare.v1 is actually reachable by a real seeded student", () => {
  function fmagNonunitBootstrapSession(studentId: string, startedAt: string): EvidenceBundle {
    const t0 = new Date(startedAt).getTime();
    const items: Array<{ item_id: string; difficulty: number; target: number }> = [
      { item_id: "itm_fn_3_4", difficulty: 0.45, target: 0.75 },
      { item_id: "itm_fn_2_5", difficulty: 0.5, target: 0.4 },
    ];
    const mk = (item: (typeof items)[number], offsetMs: number) =>
      buildObservation({
        item_id: item.item_id,
        concept_id: "F.MAG.NONUNIT",
        difficulty: item.difficulty,
        response: { kind: "position", value: item.target, target: item.target },
        verdict: "correct",
        signature: "UNCLASSIFIED",
        signature_confidence: 0.95,
        startedAtMs: t0 + offsetMs,
        endedAtMs: t0 + offsetMs + 3000,
        attempts: 1,
      });
    const PASSES = 8;
    const rounds = Array.from({ length: PASSES }, () => items).flat();
    return {
      session_id: `ses_test_fmagnonunit_${studentId}`,
      student_id: studentId,
      assignment_id: `asg_test_fmagnonunit_${studentId}`,
      game_id: "numberline.place.v2",
      started_at: startedAt,
      ended_at: new Date(t0 + rounds.length * 4000).toISOString(),
      observations: rounds.map((item, i) => mk(item, i * 4000)),
      engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
    };
  }

  function seededPriyaBelief() {
    const { trace, store: simStore } = runCohort({
      graph,
      registry,
      itemBank,
      metaOf,
      students: [
        { id: "stu_maya", profile: misconceptionHolder("WHOLE_NUMBER_BIAS", { targetConcepts: ["F.MAG.CMP", "F.MAG.NONUNIT"] }) },
        { id: "stu_devon", profile: strugglesOn(["G.PART"]) },
        { id: "stu_priya", profile: competent },
        { id: "stu_jonah", profile: misconceptionHolder("WHOLE_NUMBER_BIAS", { targetConcepts: ["F.MAG.CMP", "F.MAG.NONUNIT"] }) },
        { id: "stu_amara", profile: decayer },
        { id: "stu_leo", profile: competent },
      ],
      rounds: 18,
      seed: "seed-cohort-v1",
    });
    expect(trace.length).toBeGreaterThan(0);

    const store = new LearnerStore(metaOf);
    for (const b of simStore.allBundles()) store.ingest(b);
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    store.ingest(fmagNonunitBootstrapSession("stu_priya", yesterday.toISOString()));

    return store.belief("stu_priya");
  }

  it("stu_priya's F.MAG.NONUNIT crosses the 0.85 p_mastery gate after the bootstrap", () => {
    const belief = seededPriyaBelief();
    const fmagNonunit = belief.get("F.MAG.NONUNIT");
    expect(fmagNonunit).toBeDefined();
    expect(fmagNonunit!.p_mastery).toBeGreaterThanOrEqual(0.85);
  });

  it("selectNext() actually serves balancescale.compare.v1 for stu_priya, not a hand-written concept list", () => {
    const belief = seededPriyaBelief();
    const result = selectNext({
      studentId: "stu_priya",
      graph,
      belief,
      registry,
      itemBank,
      anchors,
      seed: "test-priya-post-bootstrap",
    });
    expect(result.assignment, `stu_priya got no assignment: ${result.reason}`).toBeDefined();
    expect(result.assignment!.concepts).toContain("F.EQV");
    expect(result.assignment!.game_id).toBe("balancescale.compare.v1");
  });
});

describe("assembleAssignment: zero-covering-games edge case", () => {
  it("returns undefined rather than throwing when no chosen concept has any covering game", () => {
    const emptyRegistry = new GameRegistry(); // no games registered at all
    expect(() => assembleAssignment(graph, emptyRegistry, itemBank, ["F.EQV"], anchors, "test-seed-5")).not.toThrow();
    const result = assembleAssignment(graph, emptyRegistry, itemBank, ["F.EQV"], anchors, "test-seed-5");
    expect(result).toBeUndefined();
  });

  it("falls through to the next chosen concept when the top-ranked one has no covering game", () => {
    // "N.MIXED.MADE.UP" isn't a real graph node at all, so it capability-matches
    // nothing; F.EQV (second in the list) should still resolve normally.
    const result = assembleAssignment(graph, registry, itemBank, ["N.MIXED.MADE.UP", "F.EQV"], anchors, "test-seed-6");
    expect(result).toBeDefined();
    expect(result!.game_id).toBe("balancescale.compare.v1");
  });
});
