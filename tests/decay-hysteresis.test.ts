import { describe, it, expect } from "vitest";
import { project, type ConceptMetaLookup } from "../src/store/projector.js";
import {
  DECAY_MARGIN,
  MASTERY_RECENT_WINDOW,
  WHEEL_SPIN_LIMIT,
  WHEEL_SPIN_MIN_SESSION_OBS,
} from "../src/store/types.js";
import type { EvidenceBundle, Observation } from "../src/contracts/schemas.js";

/**
 * Cycle 18 A1: hysteresis on decay and on mastery exit (DECAY_MARGIN), and
 * the wheel-spin minimum in-session observation count.
 */
const THRESHOLD = 0.85;
const HALF_LIFE = 28;
const metaOf: ConceptMetaLookup = () => ({ mastery_threshold: THRESHOLD, decay_half_life_days: HALF_LIFE });
const EXIT_LINE = THRESHOLD - DECAY_MARGIN;

let seq = 0;
function obs(verdict: "correct" | "incorrect", difficulty: number): Observation {
  seq += 1;
  return {
    item_id: `itm_hyst_${seq}`,
    concept_id: "D.MAG",
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
  return {
    session_id: id,
    student_id: "stu_hyst",
    assignment_id: `asg_${id}`,
    game_id: "numberline.place.v2",
    started_at: new Date(Date.UTC(2026, 0, 1 + day, 9)).toISOString(),
    ended_at: new Date(Date.UTC(2026, 0, 1 + day, 9, 5)).toISOString(),
    observations,
    engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
  };
}

const beliefOf = (bundles: EvidenceBundle[], day: number) =>
  project("stu_hyst", bundles, metaOf, new Date(Date.UTC(2026, 0, 1 + day, 12))).get("D.MAG")!;

const correct = (n: number, difficulty: number) => Array.from({ length: n }, () => obs("correct", difficulty));

describe("DECAY_MARGIN", () => {
  it("is a single constant in the 0.10-0.15 band", () => {
    expect(DECAY_MARGIN).toBeGreaterThanOrEqual(0.1);
    expect(DECAY_MARGIN).toBeLessThanOrEqual(0.15);
  });
});

describe("mastery exit needs genuine counter-evidence", () => {
  const strong = session("strong", 0, correct(20, 1));

  it("a mastered concept plus two misses stays MASTERED, and the next all-correct session is not a new transition", () => {
    expect(beliefOf([strong], 0).status).toBe("MASTERED");

    const slipped = [strong, session("slip", 1, [obs("incorrect", 1), obs("incorrect", 1)])];
    const afterSlip = beliefOf(slipped, 1);
    // Precondition: the recent-window floor alone would have dropped it (the old flicker).
    const lastThree = [...strong.observations, ...slipped[1].observations].slice(-MASTERY_RECENT_WINDOW);
    expect(lastThree.filter((o) => o.verdict === "correct").length).toBeLessThanOrEqual(1);
    expect(afterSlip.p_mastery).toBeGreaterThanOrEqual(EXIT_LINE);
    expect(afterSlip.status).toBe("MASTERED");
    expect(afterSlip.attempts_without_mastery).toBe(0);

    // routes.ts diffNewlyMastered emits only on a non-MASTERED -> MASTERED
    // transition; with the status held above, the recovery session can't re-fire it.
    const recovered = beliefOf([...slipped, session("recover", 2, correct(3, 0.6))], 2);
    expect(afterSlip.status).toBe("MASTERED");
    expect(recovered.status).toBe("MASTERED");
  });

  it("leaves MASTERED when the floor fails AND p_mastery drops below threshold - DECAY_MARGIN", () => {
    const barely = session("barely", 0, correct(6, 0.6)); // p = 5.8 / 6.8 ~= 0.853
    expect(beliefOf([barely], 0).status).toBe("MASTERED");

    const bundles = [barely, session("miss", 1, [obs("incorrect", 1), obs("incorrect", 1), obs("incorrect", 1)])];
    const belief = beliefOf(bundles, 1);
    expect(belief.p_mastery).toBeLessThan(EXIT_LINE);
    expect(belief.status).toBe("EMERGING");
    expect(belief.attempts_without_mastery).toBe(1);
  });

  it("a failed floor with p_mastery still inside the band is not an exit (misses spread over sessions)", () => {
    const base = session("base", 0, correct(16, 1)); // p = 17 / 18
    const a = session("a", 1, [obs("incorrect", 0.5), obs("incorrect", 0.5), obs("correct", 0.5)]);
    const b = session("b", 2, [obs("incorrect", 0.5), obs("incorrect", 0.5)]);
    const belief = beliefOf([base, a, b], 2);
    expect(belief.p_mastery).toBeGreaterThanOrEqual(EXIT_LINE);
    expect(belief.p_mastery).toBeLessThan(THRESHOLD);
    expect(belief.status).toBe("MASTERED");
  });

  it("known edge: floor still met but p_mastery below the band reads DECAYED (p_decayed <= p_mastery), not EMERGING", () => {
    // Not a counter-evidence exit (floor met), but MASTERED -> DECAYED is
    // defined purely on p_decayed < threshold - DECAY_MARGIN, which a
    // below-band p_mastery already satisfies. Pinned so a change is deliberate.
    const barely = session("barely", 0, correct(6, 0.6));
    const mixed = session("mixed", 1, [obs("incorrect", 1), obs("incorrect", 1), obs("incorrect", 1), obs("correct", 0), obs("correct", 0)]);
    const belief = beliefOf([barely, mixed], 1);
    expect(belief.p_mastery).toBeLessThan(EXIT_LINE);
    expect(belief.status).toBe("DECAYED");
  });
});

describe("decay hysteresis", () => {
  const strong = [session("strong", 0, correct(20, 1))]; // p = 21 / 22 ~= 0.955

  it("does not fade while p_decayed is between threshold - DECAY_MARGIN and threshold", () => {
    const belief = beliefOf(strong, 15);
    expect(belief.p_decayed).toBeLessThan(THRESHOLD);
    expect(belief.p_decayed).toBeGreaterThanOrEqual(EXIT_LINE);
    expect(belief.status).toBe("MASTERED");
  });

  it("fades to DECAYED once p_decayed falls below threshold - DECAY_MARGIN", () => {
    const belief = beliefOf(strong, 40);
    expect(belief.p_decayed).toBeLessThan(EXIT_LINE);
    expect(belief.status).toBe("DECAYED");
  });

  it("a DECAYED concept needs the full bar again: an in-band session after the gap is not MASTERED", () => {
    const barely = session("barely", 0, correct(6, 0.6));
    const decayedBefore = beliefOf([barely], 40);
    expect(decayedBefore.status).toBe("DECAYED");

    const inBand = () => [obs("correct", 0.6), obs("incorrect", 0), obs("correct", 0.6)];
    const afterGap = beliefOf([barely, session("back", 40, inBand())], 40);
    expect(afterGap.p_mastery).toBeLessThan(THRESHOLD);
    expect(afterGap.p_mastery).toBeGreaterThanOrEqual(EXIT_LINE);
    // Not MASTERED; and since the session is neither re-mastery nor genuine
    // counter-evidence, the concept is still faded, so it stays DECAYED
    // (review-due) rather than dropping to EMERGING (Cycle 19 pedagogy review).
    expect(afterGap.status).toBe("DECAYED");

    // Control: the same in-band session with no decay gap is held MASTERED.
    const noGap = beliefOf([barely, session("back", 1, inBand())], 1);
    expect(noGap.status).toBe("MASTERED");
  });
});

describe("wheel-spin needs WHEEL_SPIN_MIN_SESSION_OBS in-session observations", () => {
  it("1-of-2 slips never escalate; the same accuracy over 3 observations does", () => {
    expect(WHEEL_SPIN_MIN_SESSION_OBS).toBe(3);
    const short = Array.from({ length: 4 }, (_, i) => session(`s${i}`, i, [obs("correct", 0.5), obs("incorrect", 0.5)]));
    const held = beliefOf(short, 3);
    expect(held.attempts_without_mastery).toBe(0);
    expect(held.status).toBe("EMERGING");

    const long = Array.from({ length: WHEEL_SPIN_LIMIT }, (_, i) =>
      session(`l${i}`, i, [obs("correct", 0.5), obs("incorrect", 0.5), obs("incorrect", 0.5)]),
    );
    const spun = beliefOf(long, 2);
    expect(spun.attempts_without_mastery).toBe(WHEEL_SPIN_LIMIT);
    expect(spun.status).toBe("STUCK");
  });
});
