import { describe, it, expect } from "vitest";
import { project, type ConceptMetaLookup } from "../src/store/projector.js";
import { RECENCY_GRACE_OBS, RECENCY_HALF_LIFE_OBS, WHEEL_SPIN_LIMIT } from "../src/store/types.js";
import type { EvidenceBundle, Observation } from "../src/contracts/schemas.js";

/**
 * Cycle 18 A2: p_mastery's Beta posterior discounts each observation by its
 * age in observations -- k = newer observations on the same concept; full
 * weight while k < RECENCY_GRACE_OBS, then 0.5^((k - grace) / half-life) --
 * so early struggles stop pinning a child who has since become consistently
 * accurate below the mastery bar.
 */
const THRESHOLD = 0.85;
const metaOf: ConceptMetaLookup = () => ({ mastery_threshold: THRESHOLD, decay_half_life_days: 28 });

let seq = 0;
function obs(verdict: "correct" | "incorrect", difficulty: number): Observation {
  seq += 1;
  return {
    item_id: `itm_rec_${seq}`,
    concept_id: "G.PART",
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

const dayIso = (day: number, hour = 9) => new Date(Date.UTC(2026, 0, 1 + day, hour)).toISOString();

function session(id: string, day: number, observations: Observation[]): EvidenceBundle {
  return {
    session_id: id,
    student_id: "stu_rec",
    assignment_id: `asg_${id}`,
    game_id: "fractionbars.partition.v1",
    started_at: dayIso(day),
    ended_at: dayIso(day, 10),
    observations,
    engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
  };
}

/** Belief evaluated the evening of the last session's day, so time decay is negligible. */
function beliefAfter(bundles: EvidenceBundle[]) {
  const lastDay = new Date(bundles[bundles.length - 1].started_at);
  const now = new Date(lastDay.getTime() + 8 * 3600 * 1000);
  return project("stu_rec", bundles, metaOf, now).get("G.PART")!;
}

/** Status after every session prefix -- "never reaches MASTERED" means at no point, not just at the end. */
function statusTrail(bundles: EvidenceBundle[]) {
  return bundles.map((_, i) => beliefAfter(bundles.slice(0, i + 1)));
}

/** Deterministic PRNG (mulberry32) so the ~50% learner is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Devon-shaped history: 8 sessions of genuine struggle (2 of 5 correct --
 * enough to go STUCK), then 10 daily sessions of 8 items at 95% overall
 * (one miss, mid-session, in 4 of the 10 sessions).
 */
function devonLikeHistory(): EvidenceBundle[] {
  const bundles: EvidenceBundle[] = [];
  for (let s = 0; s < 8; s++) {
    bundles.push(
      session(`bad${s}`, s, [
        obs("incorrect", 0.6),
        obs("correct", 0.6),
        obs("incorrect", 0.6),
        obs("correct", 0.6),
        obs("incorrect", 0.6),
      ]),
    );
  }
  for (let s = 0; s < 10; s++) {
    const items = Array.from({ length: 8 }, (_, i) => obs(s % 2 === 1 && i === 3 && s < 9 ? "incorrect" : "correct", 0.6));
    bundles.push(session(`good${s}`, 8 + s, items));
  }
  return bundles;
}

/** The pre-A2 posterior: every observation at full weight regardless of age. */
function unweightedMean(bundles: EvidenceBundle[]): number {
  let alpha = 1;
  let beta = 1;
  for (const b of bundles) {
    for (const o of b.observations) {
      const w = 0.5 + 0.5 * o.difficulty;
      if (o.verdict === "correct") alpha += w;
      else beta += w;
    }
  }
  return alpha / (alpha + beta);
}

describe("RECENCY_GRACE_OBS / RECENCY_HALF_LIFE_OBS", () => {
  it("are 10 and 30 observations", () => {
    expect(RECENCY_GRACE_OBS).toBe(10);
    expect(RECENCY_HALF_LIFE_OBS).toBe(30);
  });

  it("a history no longer than the grace window scores exactly as the unweighted posterior", () => {
    const bundles = [
      session("a", 0, [obs("incorrect", 0.2), obs("correct", 0.6), obs("correct", 1), obs("incorrect", 0.4), obs("correct", 0)]),
      session("b", 1, [obs("correct", 0.2), obs("correct", 0.6), obs("incorrect", 1), obs("correct", 0.4), obs("correct", 0)]),
    ];
    expect(bundles.flatMap((b) => b.observations)).toHaveLength(RECENCY_GRACE_OBS);
    expect(beliefAfter(bundles).p_mastery).toBeCloseTo(unweightedMean(bundles), 12);
  });

  it("an observation with grace + half-life newer ones carries half weight; the prior is not discounted", () => {
    // One miss at weight 1, then grace + half-life corrects at weight 1.
    const newer = RECENCY_GRACE_OBS + RECENCY_HALF_LIFE_OBS;
    const bundles = [session("one", 0, [obs("incorrect", 1), ...Array.from({ length: newer }, () => obs("correct", 1))])];
    const r = Math.pow(0.5, 1 / RECENCY_HALF_LIFE_OBS);
    let correctMass = RECENCY_GRACE_OBS; // the newest `grace` corrects at full weight
    for (let j = 0; j < RECENCY_HALF_LIFE_OBS; j++) correctMass += Math.pow(r, j);
    const expected = (1 + correctMass) / (1 + correctMass + 1 + 0.5);
    expect(beliefAfter(bundles).p_mastery).toBeCloseTo(expected, 10);
  });

  it("orders by replay (started_at), not log insertion order", () => {
    const older = session("older", 0, [obs("incorrect", 1), obs("incorrect", 1)]);
    const newer = session("newer", 1, Array.from({ length: 10 }, () => obs("correct", 1)));
    expect(beliefAfter([older, newer]).p_mastery).toBe(
      project("stu_rec", [newer, older], metaOf, new Date(Date.UTC(2026, 0, 2, 17))).get("G.PART")!.p_mastery,
    );
  });

  it("ages by observations, not time: an idle gap leaves p_mastery unchanged (time is p_decayed's job)", () => {
    const bundles = devonLikeHistory();
    const soon = beliefAfter(bundles);
    const muchLater = project("stu_rec", bundles, metaOf, new Date(Date.UTC(2026, 5, 1))).get("G.PART")!;
    expect(muchLater.p_mastery).toBe(soon.p_mastery);
    expect(muchLater.p_decayed).toBeLessThan(soon.p_decayed);
  });
});

describe("devon-like replay: bad early history, then ~10 sessions ~95% correct", () => {
  const bundles = devonLikeHistory();
  const trail = statusTrail(bundles);

  it("the early struggle is real: the concept goes STUCK", () => {
    expect(trail.slice(0, 8).some((b) => b.attempts_without_mastery >= WHEEL_SPIN_LIMIT && b.status === "STUCK")).toBe(true);
  });

  it("the recent run is ~95% correct", () => {
    const recent = bundles.slice(8).flatMap((b) => b.observations);
    const accuracy = recent.filter((o) => o.verdict === "correct").length / recent.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.94);
    expect(accuracy).toBeLessThan(1);
  });

  it("reaches MASTERED (it could not under the unweighted posterior)", () => {
    // Precondition: the old never-forgetting posterior stays below the bar.
    expect(unweightedMean(bundles)).toBeLessThan(THRESHOLD);
    const final = trail[trail.length - 1];
    expect(final.p_mastery).toBeGreaterThanOrEqual(THRESHOLD);
    expect(final.status).toBe("MASTERED");
    expect(final.attempts_without_mastery).toBe(0);
  });
});

describe("a consistently ~50% learner never reaches MASTERED", () => {
  it("over 40 sessions of 6 items at a fair coin, no session prefix is MASTERED and p_mastery stays well below the bar", () => {
    for (const seed of [1, 7, 42, 2026]) {
      const rand = mulberry32(seed);
      const bundles = Array.from({ length: 40 }, (_, s) =>
        session(`coin${seed}_${s}`, s, Array.from({ length: 6 }, () => obs(rand() < 0.5 ? "correct" : "incorrect", 0.6))),
      );
      const all = bundles.flatMap((b) => b.observations);
      const accuracy = all.filter((o) => o.verdict === "correct").length / all.length;
      expect(Math.abs(accuracy - 0.5)).toBeLessThan(0.1);

      const trail = statusTrail(bundles);
      for (const b of trail) {
        expect(b.status).not.toBe("MASTERED");
        expect(b.status).not.toBe("DECAYED");
        expect(b.p_mastery).toBeLessThan(0.75);
      }
    }
  });

  it("a long run of misses is not erased by a short correct streak (60 misses, then 12 corrects)", () => {
    // Recency weighting's failure mode would be "a couple of good sessions
    // wipe out a long record of struggle". Two all-correct 6-item sessions
    // after 60 misses must not come near the bar.
    const misses = Array.from({ length: 10 }, (_, s) => session(`m${s}`, s, Array.from({ length: 6 }, () => obs("incorrect", 0.6))));
    const hits = Array.from({ length: 2 }, (_, s) => session(`h${s}`, 10 + s, Array.from({ length: 6 }, () => obs("correct", 0.6))));
    const belief = beliefAfter([...misses, ...hits]);
    expect(belief.p_mastery).toBeLessThan(THRESHOLD);
    expect(belief.status).not.toBe("MASTERED");
  });
});
