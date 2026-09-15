import { describe, it, expect } from "vitest";
import { project, type ConceptMetaLookup } from "../src/store/projector.js";
import { MIN_MASTERY_OBS, WHEEL_SPIN_LIMIT } from "../src/store/types.js";
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
  // Exact shape of the Cycle 16 live repro (stu_devon, D.MAG): three all-correct
  // two-item sessions leave running mastery just under 0.85, so the wheel-spin
  // counter escalates to STUCK; a following session with a single correct
  // item pushes p_mastery over the threshold.
  const stuckHistory = [
    session("s1", 0, [obs("correct", 0.6), obs("correct", 0.4)]),
    session("s2", 3, [obs("correct", 0.4), obs("correct", 0.6)]),
    session("s3", 6, [obs("correct", 0.6), obs("correct", 0.4)]),
  ];

  it("a STUCK concept does not become MASTERED from one correct item, and stays escalated", () => {
    const before = beliefOf(stuckHistory, 6);
    expect(before.status).toBe("STUCK");
    expect(before.attempts_without_mastery).toBe(WHEEL_SPIN_LIMIT);

    const after = beliefOf([...stuckHistory, session("s4", 7, [obs("correct", 0.4)])], 7);
    // Precondition that makes this a real regression test: p alone crosses the bar.
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
    expect(belief.attempts_without_mastery).toBe(1);

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
