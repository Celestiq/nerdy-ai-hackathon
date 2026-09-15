import { describe, it, expect } from "vitest";
import { project, type ConceptMetaLookup } from "../src/store/projector.js";
import { MIN_MASTERY_OBS, WHEEL_SPIN_LIMIT, WHEEL_SPIN_SESSION_ACCURACY } from "../src/store/types.js";
import type { EvidenceBundle, Observation } from "../src/contracts/schemas.js";

/**
 * Honest mastery (BACKLOG Cycle 17 #1): MASTERED needs an evidence floor,
 * not only p_mastery >= threshold, and one lucky answer must not clear a
 * STUCK escalation.
 */
const REAL_THRESHOLD = 0.85; // the graph's actual mastery_threshold for authored concepts
const metaOf: ConceptMetaLookup = () => ({ mastery_threshold: REAL_THRESHOLD, decay_half_life_days: 28 });

let seq = 0;
function obs(verdict: "correct" | "incorrect", difficulty: number, conceptId = "D.MAG"): Observation {
  seq += 1;
  return {
    item_id: `itm_gate_${seq}`,
    concept_id: conceptId,
    difficulty,
    response: { kind: "test", value: 1, target: 1 },
    verdict,
    signature: "UNCLASSIFIED",
    signature_confidence: 0,
    latency_ms: 2000,
    attempts: 1,
    flags: [],
  };
}

function session(id: string, day: number, observations: Observation[]): EvidenceBundle {
  const started = new Date(Date.UTC(2026, 0, 1 + day, 9)).toISOString();
  return {
    session_id: id,
    student_id: "stu_gate",
    assignment_id: `asg_${id}`,
    game_id: "numberline.place.v2",
    started_at: started,
    ended_at: new Date(Date.UTC(2026, 0, 1 + day, 9, 5)).toISOString(),
    observations,
    engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
  };
}

const beliefOf = (bundles: EvidenceBundle[], day: number, conceptId = "D.MAG") =>
  project("stu_gate", bundles, metaOf, new Date(Date.UTC(2026, 0, 1 + day, 12))).get(conceptId)!;

describe("mastery evidence floor", () => {
  // A genuinely stuck history: a strong opening session, then three sessions
  // in which the child mostly errs (1 of 3 correct each). Each erring session
  // misses the bar (evidence floor fails: at most 1 of the last 3 correct)
  // with raw accuracy < WHEEL_SPIN_SESSION_ACCURACY, so the wheel-spin counter
  // escalates to STUCK while p_mastery stays at/above 0.85 on the strength of
  // the opening session. s3 ends on a correct answer, so a single further
  // correct item satisfies both p >= threshold and the last-3 floor -- only
  // the "fresh evidence since STUCK" rule stands between it and MASTERED.
  // (The Cycle 16 devon shape -- all-correct 2-item sessions -- is no longer
  // STUCK at all; see the wheel-spin describe block below.)
  const stuckHistory = [
    session("s0", 0, Array.from({ length: 20 }, () => obs("correct", 1))),
    session("s1", 1, [obs("correct", 1), obs("incorrect", 0), obs("incorrect", 0)]),
    session("s2", 3, [obs("correct", 1), obs("incorrect", 0), obs("incorrect", 0)]),
    session("s3", 6, [obs("incorrect", 0), obs("incorrect", 0), obs("correct", 1)]),
  ];

  it("a STUCK concept does not become MASTERED from one correct item, and stays escalated", () => {
    const before = beliefOf(stuckHistory, 6);
    expect(before.status).toBe("STUCK");
    expect(before.attempts_without_mastery).toBe(WHEEL_SPIN_LIMIT);

    const after = beliefOf([...stuckHistory, session("s4", 7, [obs("correct", 0.4)])], 7);
    // Precondition that makes this a real regression test: p and the recent-window
    // floor alone would both allow MASTERED here.
    expect(after.p_mastery).toBeGreaterThanOrEqual(REAL_THRESHOLD);
    expect(after.status).toBe("STUCK");
    expect(after.attempts_without_mastery).toBeGreaterThanOrEqual(WHEEL_SPIN_LIMIT);
  });

  it("a STUCK concept can still reach MASTERED once enough fresh evidence arrives", () => {
    const bundles = [
      ...stuckHistory,
      session("s4", 7, [obs("correct", 0.4)]),
      session("s5", 8, [obs("correct", 0.5), obs("correct", 0.6)]),
    ];
    const belief = beliefOf(bundles, 8);
    expect(belief.status).toBe("MASTERED");
    expect(belief.attempts_without_mastery).toBe(0);
  });

  it("requires at least MIN_MASTERY_OBS observations even when p_mastery clears the threshold", () => {
    const lenient: ConceptMetaLookup = () => ({ mastery_threshold: 0.8, decay_half_life_days: 28 });
    const few = Array.from({ length: MIN_MASTERY_OBS - 1 }, () => obs("correct", 1));
    const bundles = [session("few", 0, few)];
    const belief = project("stu_gate", bundles, lenient, new Date(Date.UTC(2026, 0, 1, 12))).get("D.MAG")!;
    expect(belief.p_mastery).toBeGreaterThanOrEqual(0.8);
    expect(belief.status).toBe("EMERGING");
    // All-correct session below the floor: Hold, not a wheel-spin.
    expect(belief.attempts_without_mastery).toBe(0);

    const enough = project(
      "stu_gate",
      [session("few", 0, few), session("more", 1, [obs("correct", 1)])],
      lenient,
      new Date(Date.UTC(2026, 0, 2, 12)),
    ).get("D.MAG")!;
    expect(enough.status).toBe("MASTERED");
  });

  it("is not MASTERED when the most recent observations are mostly incorrect, despite a high p_mastery", () => {
    const bundles = [
      session("strong", 0, Array.from({ length: 20 }, () => obs("correct", 1))),
      session("slip", 1, [obs("incorrect", 1), obs("incorrect", 1)]),
    ];
    const belief = beliefOf(bundles, 1);
    expect(belief.p_mastery).toBeGreaterThanOrEqual(REAL_THRESHOLD);
    expect(belief.status).toBe("EMERGING");
    expect(belief.attempts_without_mastery).toBe(1);
  });

  it("judges 'most recent' in replay (started_at) order, not log insertion order", () => {
    const older = session("older", 0, [obs("incorrect", 0), obs("incorrect", 0)]);
    const newer = session("newer", 1, Array.from({ length: 20 }, () => obs("correct", 1)));
    // Inserted newest-first: by raw insertion order the last three observations
    // would be correct, incorrect, incorrect and fail the floor.
    const belief = beliefOf([newer, older], 1);
    expect(belief.p_mastery).toBeGreaterThanOrEqual(REAL_THRESHOLD);
    expect(belief.status).toBe("MASTERED");
    expect(belief).toEqual(beliefOf([older, newer], 1));
  });
});

describe("wheel-spin counter: reset / increment / hold", () => {
  // Cycle 17 pedagogy-review regression (stu_devon, D.MAG): 100% accuracy on
  // short low-difficulty sessions leaves running mastery at 0.714 -> 0.800 ->
  // 0.846, just under 0.85. That is not being stuck.
  const devonHistory = [
    session("d1", 0, [obs("correct", 0.6), obs("correct", 0.4)]),
    session("d2", 3, [obs("correct", 0.4), obs("correct", 0.6)]),
    session("d3", 6, [obs("correct", 0.6), obs("correct", 0.4)]),
  ];

  it("6/6 correct across 3 below-bar sessions is EMERGING with the counter at 0, not STUCK", () => {
    const belief = beliefOf(devonHistory, 6);
    // Precondition: every session really does miss the bar on running mastery.
    expect(belief.p_mastery).toBeLessThan(REAL_THRESHOLD);
    expect(belief.status).toBe("EMERGING");
    expect(belief.attempts_without_mastery).toBe(0);
  });

  it("increments only for below-bar sessions whose own accuracy is under WHEEL_SPIN_SESSION_ACCURACY", () => {
    // 4/5 correct sits exactly at 0.8 -> hold; 3/4 correct is under -> increment.
    expect(WHEEL_SPIN_SESSION_ACCURACY).toBe(0.8);
    const atBar = Array.from({ length: 3 }, (_, i) =>
      session(`h${i}`, i, [obs("correct", 0), obs("correct", 0), obs("correct", 0), obs("correct", 0), obs("incorrect", 1)]),
    );
    const held = beliefOf(atBar, 2);
    expect(held.p_mastery).toBeLessThan(REAL_THRESHOLD);
    expect(held.attempts_without_mastery).toBe(0);
    expect(held.status).toBe("EMERGING");

    const under = Array.from({ length: 3 }, (_, i) =>
      session(`u${i}`, i, [obs("correct", 0), obs("correct", 0), obs("correct", 0), obs("incorrect", 1)]),
    );
    const spun = beliefOf(under, 2);
    expect(spun.attempts_without_mastery).toBe(WHEEL_SPIN_LIMIT);
    expect(spun.status).toBe("STUCK");
  });

  it("an accurate below-bar session holds an existing escalation rather than clearing or deepening it", () => {
    const erring = Array.from({ length: 3 }, (_, i) => session(`e${i}`, i, [obs("correct", 0.5), obs("incorrect", 0.5)]));
    const stuck = beliefOf(erring, 2);
    expect(stuck.status).toBe("STUCK");
    expect(stuck.attempts_without_mastery).toBe(WHEEL_SPIN_LIMIT);

    const afterGood = beliefOf([...erring, session("good", 3, [obs("correct", 0.5), obs("correct", 0.5)])], 3);
    expect(afterGood.p_mastery).toBeLessThan(REAL_THRESHOLD);
    expect(afterGood.attempts_without_mastery).toBe(WHEEL_SPIN_LIMIT);
    expect(afterGood.status).toBe("STUCK");
  });
});
