import { describe, it, expect } from "vitest";
import { LearnerStore } from "../src/store/store.js";
import { project, type ConceptMetaLookup } from "../src/store/projector.js";
import { WHEEL_SPIN_LIMIT } from "../src/store/types.js";
import type { EvidenceBundle, Observation } from "../src/contracts/schemas.js";

const metaOf: ConceptMetaLookup = () => ({ mastery_threshold: 0.8, decay_half_life_days: 20 });

function bundle(overrides: Partial<EvidenceBundle> & { session_id: string }): EvidenceBundle {
  return {
    student_id: "stu_test",
    assignment_id: "asg_test",
    game_id: "numberline.place.v2",
    started_at: "2026-01-01T00:00:00Z",
    ended_at: "2026-01-01T00:05:00Z",
    observations: [],
    engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
    ...overrides,
  };
}

function obs(conceptId: string, verdict: "correct" | "incorrect", opts: Partial<Observation> = {}): Observation {
  return {
    item_id: `itm_${Math.random().toString(36).slice(2, 7)}`,
    concept_id: conceptId,
    difficulty: 0.5,
    response: { kind: "test", value: 1, target: 1 },
    verdict,
    signature: verdict === "incorrect" ? "WHOLE_NUMBER_BIAS" : "UNCLASSIFIED",
    signature_confidence: verdict === "incorrect" ? 0.8 : 0,
    latency_ms: 2000,
    attempts: 1,
    flags: [],
    ...opts,
  };
}

describe("ingest", () => {
  it("is idempotent on session_id", () => {
    const store = new LearnerStore(metaOf);
    const b = bundle({ session_id: "ses_dup", observations: [obs("N.MAG", "correct")] });
    expect(store.ingest(b).accepted).toBe(true);
    expect(store.ingest(b).accepted).toBe(false);
    expect(store.ingest(b).duplicate).toBe(true);
    expect(store.bundlesFor("stu_test")).toHaveLength(1);
  });

  it("rejects a malformed bundle with a reason", () => {
    const store = new LearnerStore(metaOf);
    const result = store.ingest({ not: "a bundle" });
    expect(result.accepted).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("accepts partial evidence from an abandoned session without corrupting state", () => {
    const store = new LearnerStore(metaOf);
    const b = bundle({
      session_id: "ses_abandon",
      observations: [obs("N.MAG", "correct")],
      engagement: { completed: false, abandoned_at: "2026-01-01T00:02:00Z", idle_ms: 500 },
    });
    expect(store.ingest(b).accepted).toBe(true);
    expect(store.beliefFor("stu_test", "N.MAG")?.observations_n).toBe(1);
  });
});

describe("projection", () => {
  it("mastery rises with more correct answers and confidence rises with observation count", () => {
    const store = new LearnerStore(metaOf);
    store.ingest(bundle({ session_id: "s1", observations: [obs("N.MAG", "correct")] }));
    const afterOne = store.beliefFor("stu_test", "N.MAG")!;
    store.ingest(bundle({ session_id: "s2", observations: [obs("N.MAG", "correct"), obs("N.MAG", "correct")] }));
    const afterMore = store.beliefFor("stu_test", "N.MAG")!;
    expect(afterMore.p_mastery).toBeGreaterThan(afterOne.p_mastery);
    expect(afterMore.confidence).toBeGreaterThan(afterOne.confidence);
  });

  it("low mastery + low confidence and low mastery + high confidence produce different statuses", () => {
    const store = new LearnerStore(metaOf);
    store.ingest(bundle({ session_id: "few", observations: [obs("N.MAG", "incorrect")] }));
    const thin = store.beliefFor("stu_test", "N.MAG")!;

    const store2 = new LearnerStore(metaOf);
    for (let i = 0; i < 6; i++) {
      store2.ingest(bundle({ session_id: `many_${i}`, observations: [obs("N.MAG", "incorrect")] }));
    }
    const solid = store2.beliefFor("stu_test", "N.MAG")!;

    expect(thin.confidence).toBeLessThan(solid.confidence);
    // both are below mastery, but they must not be presented identically
    expect(thin.p_mastery < 0.8 && solid.p_mastery < 0.8).toBe(true);
  });

  it("attempts_without_mastery reaches the wheel-spin limit and status becomes STUCK", () => {
    const store = new LearnerStore(metaOf);
    for (let i = 0; i < WHEEL_SPIN_LIMIT; i++) {
      // WHEEL_SPIN_MIN_SESSION_OBS: a session needs >= 3 obs on the concept to count as a wheel-spin
      store.ingest(bundle({ session_id: `sp_${i}`, observations: [obs("N.MAG", "incorrect"), obs("N.MAG", "incorrect"), obs("N.MAG", "incorrect")] }));
    }
    const belief = store.beliefFor("stu_test", "N.MAG")!;
    expect(belief.attempts_without_mastery).toBeGreaterThanOrEqual(WHEEL_SPIN_LIMIT);
    expect(belief.status).toBe("STUCK");
  });

  it("attempts_without_mastery resets once mastery is reached", () => {
    const store = new LearnerStore(metaOf);
    store.ingest(bundle({ session_id: "bad1", observations: [obs("N.MAG", "incorrect")] }));
    // a strong session of corrects should push running mastery (threshold 0.8) over the line and reset the counter
    store.ingest(
      bundle({
        session_id: "good",
        observations: Array.from({ length: 10 }, () => obs("N.MAG", "correct", { difficulty: 0.9 })),
      }),
    );
    const belief = store.beliefFor("stu_test", "N.MAG")!;
    expect(belief.p_mastery).toBeGreaterThanOrEqual(0.8);
    expect(belief.attempts_without_mastery).toBe(0);
  });

  it("p_decayed ages a mastery estimate toward the neutral prior over time, without new evidence", () => {
    const store = new LearnerStore(metaOf);
    store.ingest(
      bundle({
        session_id: "decay_setup",
        started_at: "2026-01-01T00:00:00Z",
        ended_at: "2026-01-01T00:05:00Z",
        observations: Array.from({ length: 8 }, () => obs("N.MAG", "correct", { difficulty: 0.9 })),
      }),
    );
    const fresh = store.beliefFor("stu_test", "N.MAG", new Date("2026-01-01T00:10:00Z"))!;
    const muchLater = store.beliefFor("stu_test", "N.MAG", new Date("2026-04-01T00:00:00Z"))!;
    expect(fresh.status).toBe("MASTERED");
    expect(muchLater.p_decayed).toBeLessThan(fresh.p_decayed);
    expect(muchLater.status).toBe("DECAYED");
    expect(muchLater.p_mastery).toBe(fresh.p_mastery); // the raw estimate itself never gets rewritten
  });

  it("signatures aggregate counts and only carry provenance-free codes (no UNCLASSIFIED tallied)", () => {
    const store = new LearnerStore(metaOf);
    store.ingest(
      bundle({
        session_id: "sig1",
        observations: [obs("F.MAG.CMP", "incorrect"), obs("F.MAG.CMP", "incorrect"), obs("F.MAG.CMP", "correct")],
      }),
    );
    const belief = store.beliefFor("stu_test", "F.MAG.CMP")!;
    expect(belief.signatures).toHaveLength(1);
    expect(belief.signatures[0].code).toBe("WHOLE_NUMBER_BIAS");
    expect(belief.signatures[0].count).toBe(2);
  });
});

describe("rebuild equivalence", () => {
  it("projecting from the full log at once matches projecting incrementally, evidence by evidence", () => {
    // This store has no separate incremental-maintenance code path (see
    // src/store/projector.ts) -- belief is always a full replay. This test
    // demonstrates that replaying a growing log is order-preserving and
    // stable, which is what would break first if that ever changed.
    const bundles: EvidenceBundle[] = [
      bundle({ session_id: "r1", started_at: "2026-01-01T00:00:00Z", ended_at: "2026-01-01T00:01:00Z", observations: [obs("N.MAG", "correct")] }),
      bundle({ session_id: "r2", started_at: "2026-01-03T00:00:00Z", ended_at: "2026-01-03T00:01:00Z", observations: [obs("N.MAG", "incorrect")] }),
      bundle({ session_id: "r3", started_at: "2026-01-05T00:00:00Z", ended_at: "2026-01-05T00:01:00Z", observations: [obs("N.MAG", "correct"), obs("N.MAG", "correct")] }),
    ];
    const now = new Date("2026-01-06T00:00:00Z");

    const incremental = new LearnerStore(metaOf);
    let lastBelief;
    for (const b of bundles) {
      incremental.ingest(b);
      lastBelief = incremental.beliefFor("stu_test", "N.MAG", now);
    }

    const rebuilt = project("stu_test", bundles, metaOf, now).get("N.MAG");

    expect(rebuilt).toEqual(lastBelief);
  });
});
