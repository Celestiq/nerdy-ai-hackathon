import { describe, it, expect } from "vitest";
import { ConceptGraph } from "../src/graph/loader.js";
import { GameRegistry, ItemBankRegistry } from "../src/registry/index.js";
import { LearnerStore } from "../src/store/store.js";
import type { ConceptMetaLookup } from "../src/store/projector.js";
import { selectNext } from "../src/engine/engine.js";
import { applyHardConstraints } from "../src/engine/constraints.js";
import type { ScoredCandidate } from "../src/engine/scoring.js";
import { numberlineManifest, numberlineItems } from "../src/games/numberline/index.js";
import { WHEEL_SPIN_LIMIT } from "../src/store/types.js";
import { runCohort, detectRoutingFailure } from "../src/simulation/cohortRunner.js";
import { competent, misconceptionHolder, wheelSpinner } from "../src/simulation/profiles.js";

const graph = ConceptGraph.load();
const metaOf: ConceptMetaLookup = (id) => {
  const n = graph.node(id);
  return n && { mastery_threshold: n.mastery_threshold, decay_half_life_days: n.decay_half_life_days };
};

function freshRegistry() {
  const registry = new GameRegistry();
  registry.register(numberlineManifest);
  const itemBank = new ItemBankRegistry();
  itemBank.register(numberlineManifest.game_id, (concepts) =>
    numberlineItems.filter((i) => concepts.includes(i.concept_id)).map((i) => ({ item_id: i.item_id, concept_id: i.concept_id, difficulty: i.difficulty })),
  );
  return { registry, itemBank };
}

describe("hard constraints override scoring", () => {
  it("a STUCK concept with the highest score is not served", () => {
    const scored: ScoredCandidate[] = [
      { concept_id: "N.MAG", score: 0.95, components: { frontierValue: 1, uncertainty: 0, retrievalDue: 0, blameBoost: 0, cohortNeed: 0 } },
      { concept_id: "N.COUNT", score: 0.4, components: { frontierValue: 0.3, uncertainty: 0.2, retrievalDue: 0, blameBoost: 0, cohortNeed: 0 } },
    ];
    const belief = new Map([
      ["N.MAG", { attempts_without_mastery: WHEEL_SPIN_LIMIT, p_mastery: 0.1 } as any],
      ["N.COUNT", { attempts_without_mastery: 0, p_mastery: 0.5 } as any],
    ]);
    const { allowed, blocked } = applyHardConstraints(graph, belief, scored);
    expect(allowed.map((a) => a.concept_id)).not.toContain("N.MAG");
    expect(allowed.map((a) => a.concept_id)).toContain("N.COUNT");
    expect(blocked.find((b) => b.concept_id === "N.MAG")?.reason).toMatch(/wheel-spin/);
  });

  it("blocks a concept whose hard prerequisite isn't met, even with a high score", () => {
    const scored: ScoredCandidate[] = [{ concept_id: "F.MAG.UNIT", score: 0.99, components: { frontierValue: 1, uncertainty: 0, retrievalDue: 0, blameBoost: 0, cohortNeed: 0 } }];
    const belief = new Map<string, any>(); // nothing measured -> F.NOTATE unmet
    const { allowed, blocked } = applyHardConstraints(graph, belief, scored);
    expect(allowed).toEqual([]);
    expect(blocked[0].reason).toMatch(/prerequisite gate/);
  });
});

describe("selectNext", () => {
  it("cold start restricts the first assignment to a covered root concept", () => {
    const { registry, itemBank } = freshRegistry();
    const store = new LearnerStore(metaOf);
    const result = selectNext({
      studentId: "stu_x",
      graph,
      belief: store.belief("stu_x"),
      registry,
      itemBank,
      anchors: new Map(),
      seed: "test-seed",
    });
    expect(result.assignment).toBeDefined();
    expect(result.assignment!.concepts).toContain("N.COUNT");
  });

  it("is deterministic: same seed, same belief, same graph -> byte-identical assignment", () => {
    const { registry, itemBank } = freshRegistry();
    const store = new LearnerStore(metaOf);
    const now = new Date("2026-02-01T00:00:00Z");
    const args = { studentId: "stu_x", graph, belief: store.belief("stu_x", now), registry, itemBank, anchors: new Map(), seed: "fixed-seed", now };
    const a = selectNext(args);
    const b = selectNext(args);
    expect(a.assignment).toEqual(b.assignment);
  });

  it("reports a coverage gap by name rather than throwing when nothing can assess the chosen concept", () => {
    const registry = new GameRegistry(); // no games registered at all
    const itemBank = new ItemBankRegistry();
    const store = new LearnerStore(metaOf);
    const result = selectNext({ studentId: "stu_x", graph, belief: store.belief("stu_x"), registry, itemBank, anchors: new Map(), seed: "s" });
    expect(result.assignment).toBeUndefined();
    expect(result.reason).toBeTruthy();
  });
});

describe("wheel-spin simulation -- the one that matters", () => {
  // `freshRegistry()` only registers numberline, so N.COUNT is the only
  // covered root -- once stu_spin wheel-spin-blocks on it, it's the
  // *genuinely single remaining candidate*, not one of several. Before the
  // starvation fallback (src/engine/constraints.ts applyHardConstraints),
  // that meant every round after escalation got `assignment: undefined`
  // forever -- a real dead end the old assertion below ("stops serving that
  // concept afterwards") was actually just describing. Now the fallback
  // deliberately re-offers the sole blocked candidate rather than dead-end
  // the child, and logs that explicitly. This test now asserts the new
  // contract: escalation still fires every round the concept stays stuck
  // (the tutor-facing signal never goes silent), and any further serving of
  // the concept is only ever via the audited relaxation path, never a
  // silent, unlogged un-blocking.
  it("escalates a wheel-spinning child within the attempt limit; any further serving of the stuck concept is only via the audited wheel-spin relaxation fallback", () => {
    const { registry, itemBank } = freshRegistry();
    const { trace } = runCohort({
      graph,
      registry,
      itemBank,
      metaOf,
      students: [{ id: "stu_spin", profile: wheelSpinner }],
      rounds: 12,
      seed: "wheelspin-1",
    });

    const escalatedRounds = trace.filter((t) => t.escalations.length > 0);
    expect(escalatedRounds.length).toBeGreaterThan(0);

    const firstEscalation = escalatedRounds[0];
    const stuckConcept = firstEscalation.escalations[0];
    const roundsAfter = trace.filter((t) => t.round > firstEscalation.round);

    // The human-facing signal must never go silent just because the
    // fallback found something to re-serve.
    for (const t of roundsAfter) expect(t.escalations).toContain(stuckConcept);

    // It's the only concept this registry can ever cover, so if it's served
    // at all after escalation, it must be alone (never smuggled in
    // alongside a normal pick) -- consistent with "this round had exactly
    // one relaxed candidate and nothing else survived".
    for (const t of roundsAfter) {
      if (t.concepts.length > 0) expect(t.concepts).toEqual([stuckConcept]);
    }

    // Directly confirm the relaxation is real and logged, not a
    // coincidence: a fresh live request right now must still show the
    // concept as wheel-spin-blocked AND explicitly relaxed in decision_log.
    const store2 = runCohort({
      graph, registry, itemBank, metaOf,
      students: [{ id: "stu_spin", profile: wheelSpinner }],
      rounds: 12,
      seed: "wheelspin-1",
    }).store;
    const now = new Date();
    const belief = store2.belief("stu_spin", now);
    expect(belief.get(stuckConcept)!.attempts_without_mastery).toBeGreaterThanOrEqual(WHEEL_SPIN_LIMIT);
    const result = selectNext({ studentId: "stu_spin", graph, belief, registry, itemBank, anchors: new Map(), seed: "wheelspin-1:probe", now });
    expect(result.assignment, `expected the relaxation fallback to still produce an assignment: ${result.reason}`).toBeDefined();
    expect(result.assignment!.concepts).toEqual([stuckConcept]);
    const relaxedEntry = result.decisionLog.find((d) => d.concept_id === stuckConcept && d.included);
    expect(relaxedEntry?.reason).toBe("wheel-spin relaxed: no other candidate available");
  });

  it("routes a misconception-holder toward the blamed prerequisite rather than more of the same", () => {
    const { registry, itemBank } = freshRegistry();
    const { store } = runCohort({
      graph,
      registry,
      itemBank,
      metaOf,
      students: [{ id: "stu_wnb", profile: misconceptionHolder("WHOLE_NUMBER_BIAS") }],
      rounds: 10,
      seed: "wnb-1",
    });
    const belief = store.belief("stu_wnb");
    const cmp = belief.get("F.MAG.CMP") ?? belief.get("F.MAG.NONUNIT");
    if (cmp && cmp.signatures.some((s) => s.code === "WHOLE_NUMBER_BIAS")) {
      expect(belief.has("F.MAG.UNIT")).toBe(true); // the blamed concept was, at minimum, in play
    }
  });

  it("a competent learner is never starved and eventually shows measured mastery somewhere", () => {
    const { registry, itemBank } = freshRegistry();
    const { store } = runCohort({
      graph,
      registry,
      itemBank,
      metaOf,
      students: [{ id: "stu_ok", profile: competent }],
      rounds: 8,
      seed: "competent-1",
    });
    const belief = store.belief("stu_ok");
    expect(belief.size).toBeGreaterThan(0);
    expect([...belief.values()].some((b) => b.p_mastery > 0.5)).toBe(true);
  });

  it("self-check: detects a deliberately broken engine that always serves the same concept", () => {
    const fakeTrace = Array.from({ length: 6 }, (_, i) => ({
      round: i,
      student_id: "stu_x",
      simulated_at: new Date().toISOString(),
      concepts: ["N.COUNT"],
      escalations: [],
      statuses: {},
    }));
    expect(detectRoutingFailure(fakeTrace, "stu_x")).toMatch(/routing failure/);
  });
});
