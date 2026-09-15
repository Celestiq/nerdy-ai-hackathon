import { describe, it, expect } from "vitest";
import { project, type ConceptMetaLookup, type ProjectorOptions } from "../src/store/projector.js";
import { STUCK_EXIT_CLEAN_SESSIONS, WHEEL_SPIN_LIMIT } from "../src/store/types.js";
import type { EvidenceBundle, Observation } from "../src/contracts/schemas.js";

/**
 * Cycle 19 Lane S:
 *  - STUCK exits on fresh evidence: STUCK_EXIT_CLEAN_SESSIONS (3) accurate
 *    sessions (>= 3 obs at >= 0.8) after going STUCK -> EMERGING, regardless
 *    of whole-history p_mastery.
 *  - Entering MASTERED needs >= 2 correct non-anchor observations in the
 *    entering session when the store knows which items are anchors.
 */
const THRESHOLD = 0.85;
const metaOf: ConceptMetaLookup = () => ({ mastery_threshold: THRESHOLD, decay_half_life_days: 28 });

const ANCHOR = "itm_fb_3_4v2_3";
const withAnchors: ProjectorOptions = { isAnchorItem: (id) => id === ANCHOR };

let seq = 0;
function obs(verdict: "correct" | "incorrect", concept: string, itemId?: string, difficulty = 0.6): Observation {
  seq += 1;
  return {
    item_id: itemId ?? `itm_se_${seq}`,
    concept_id: concept,
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
    student_id: "stu_se",
    assignment_id: `asg_${id}`,
    game_id: "fractionbars.partition.v1",
    started_at: dayIso(day),
    ended_at: dayIso(day, 10),
    observations,
    engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
  };
}

function beliefAfter(bundles: EvidenceBundle[], concept: string, options?: ProjectorOptions) {
  const last = new Date(bundles[bundles.length - 1].started_at);
  return project("stu_se", bundles, metaOf, new Date(last.getTime() + 8 * 3600 * 1000), options).get(concept)!;
}

function trail(bundles: EvidenceBundle[], concept: string, options?: ProjectorOptions) {
  return bundles.map((_, i) => beliefAfter(bundles.slice(0, i + 1), concept, options));
}

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

describe("STUCK exits on fresh evidence", () => {
  it("devon replay: a bad early G.PART history, then perfect 3-item sessions, clears STUCK within 4 sessions", () => {
    expect(STUCK_EXIT_CLEAN_SESSIONS).toBe(3);
    // 12 sessions at 1 of 5 correct: heavy early struggle, STUCK, p far below the bar.
    const bad = Array.from({ length: 12 }, (_, s) =>
      session(`bad${s}`, s, [
        obs("incorrect", "G.PART"),
        obs("correct", "G.PART"),
        obs("incorrect", "G.PART"),
        obs("incorrect", "G.PART"),
        obs("incorrect", "G.PART"),
      ]),
    );
    const perfect = Array.from({ length: 4 }, (_, s) =>
      session(`good${s}`, 12 + s, [obs("correct", "G.PART"), obs("correct", "G.PART"), obs("correct", "G.PART")]),
    );
    const before = beliefAfter(bad, "G.PART");
    expect(before.status).toBe("STUCK");

    const t = trail([...bad, ...perfect], "G.PART").slice(bad.length);
    const firstClear = t.findIndex((b) => b.status !== "STUCK");
    expect(firstClear).toBeGreaterThanOrEqual(0);
    expect(firstClear).toBeLessThan(4);
    // One or two accurate sessions are not enough.
    expect(t[0].status).toBe("STUCK");
    expect(t[1].status).toBe("STUCK");
    // It clears via fresh evidence, not the whole-history bar.
    expect(t[firstClear].p_mastery).toBeLessThan(THRESHOLD);
    expect(t[firstClear].status).toBe("EMERGING");
    expect(t[firstClear].attempts_without_mastery).toBe(0);
    // And stays clear through the remaining perfect sessions.
    for (const b of t.slice(firstClear)) expect(b.status).not.toBe("STUCK");
  });

  it("a ~50% learner that went STUCK stays STUCK (bar rare two-lucky-sessions blips), and never masters", () => {
    // Not an absolute guarantee: at a fair coin, a 6-item session is >= 0.8
    // accurate with probability 7/64, so three in a row happen very rarely.
    // Measured over 200 x 40-session runs at k=3: 6 runs blip out at least
    // once, 0.3% of post-STUCK sessions read non-STUCK (each blip returns to
    // STUCK after 3 erring sessions), and none reach MASTERED. (At k=2: 56
    // runs, 2.8%.)
    let post = 0;
    let postNotStuck = 0;
    for (let seed = 0; seed < 40; seed++) {
      const rand = mulberry32(seed);
      const bundles = Array.from({ length: 40 }, (_, s) =>
        session(`coin${seed}_${s}`, s, Array.from({ length: 6 }, () => obs(rand() < 0.5 ? "correct" : "incorrect", "G.PART"))),
      );
      const t = trail(bundles, "G.PART");
      const firstStuck = t.findIndex((b) => b.status === "STUCK");
      expect(firstStuck).toBeGreaterThanOrEqual(0);
      for (const b of t.slice(firstStuck)) {
        post += 1;
        if (b.status !== "STUCK") postNotStuck += 1;
        expect(b.status).not.toBe("MASTERED");
        expect(b.status).not.toBe("DECAYED");
      }
    }
    expect(postNotStuck / post).toBeLessThan(0.01);
  });
});

describe("entering MASTERED needs non-anchor evidence", () => {
  it("anchor answers alone never produce MASTERED, first time or re-bloom", () => {
    // First time: one correct anchor answer per session, as a partition
    // session serving F.MAG.CMP only via its cohort anchor would log.
    const anchorOnly = Array.from({ length: 14 }, (_, s) => session(`a${s}`, s, [obs("correct", "F.MAG.CMP", ANCHOR, 0.55)]));
    // Precondition: without the predicate this history does reach MASTERED.
    expect(trail(anchorOnly, "F.MAG.CMP").some((b) => b.status === "MASTERED")).toBe(true);
    for (const b of trail(anchorOnly, "F.MAG.CMP", withAnchors)) expect(b.status).not.toBe("MASTERED");

    // Re-bloom: genuinely mastered, then faded over a long gap, then only anchor answers.
    const earned = session("earned", 0, Array.from({ length: 10 }, () => obs("correct", "F.MAG.CMP")));
    expect(beliefAfter([earned], "F.MAG.CMP", withAnchors).status).toBe("MASTERED");
    const faded = [earned, ...Array.from({ length: 4 }, (_, s) => session(`r${s}`, 200 + s, [obs("correct", "F.MAG.CMP", ANCHOR, 0.55)]))];
    expect(trail(faded, "F.MAG.CMP").slice(1).some((b) => b.status === "MASTERED")).toBe(true);
    for (const b of trail(faded, "F.MAG.CMP", withAnchors).slice(1)) expect(b.status).not.toBe("MASTERED");

    // Two correct non-anchor answers in a session do re-enter MASTERED.
    const back = [...faded, session("back", 205, [obs("correct", "F.MAG.CMP", ANCHOR, 0.55), obs("correct", "F.MAG.CMP"), obs("correct", "F.MAG.CMP")])];
    expect(beliefAfter(back, "F.MAG.CMP", withAnchors).status).toBe("MASTERED");
  });

  it("a faded concept answered only via correct anchors stays DECAYED (review-due, prereq-satisfying), then re-blooms from DECAYED", () => {
    const earned = session("earned", 0, Array.from({ length: 10 }, () => obs("correct", "F.MAG.CMP")));
    // Faded before any further play.
    const beforeAnchors = project("stu_se", [earned], metaOf, new Date(Date.UTC(2026, 6, 20)), withAnchors).get("F.MAG.CMP")!;
    expect(beforeAnchors.status).toBe("DECAYED");

    const anchorSessions = Array.from({ length: 4 }, (_, s) => session(`fa${s}`, 200 + s, [obs("correct", "F.MAG.CMP", ANCHOR, 0.55)]));
    const t = trail([earned, ...anchorSessions], "F.MAG.CMP", withAnchors).slice(1);
    for (const b of t) expect(b.status).toBe("DECAYED");

    // Entering from DECAYED (what /api/evidence labels kind "rebloom").
    const before = t[t.length - 1];
    const after = beliefAfter(
      [...[earned, ...anchorSessions], session("bloom", 205, [obs("correct", "F.MAG.CMP"), obs("correct", "F.MAG.CMP")])],
      "F.MAG.CMP",
      withAnchors,
    );
    expect(before.status).toBe("DECAYED");
    expect(after.status).toBe("MASTERED");
  });

  it("a faded concept that meets genuine counter-evidence leaves DECAYED", () => {
    const earned = session("earned", 0, Array.from({ length: 10 }, () => obs("correct", "F.MAG.CMP")));
    const misses = session("miss", 200, Array.from({ length: 12 }, () => obs("incorrect", "F.MAG.CMP")));
    const b = beliefAfter([earned, misses], "F.MAG.CMP", withAnchors);
    expect(b.p_mastery).toBeLessThan(THRESHOLD - 0.15);
    expect(b.status).not.toBe("DECAYED");
    expect(b.status).not.toBe("MASTERED");
  });
});
