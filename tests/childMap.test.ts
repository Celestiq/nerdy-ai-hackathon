import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { api, buildChildMap, nextSessionSeed, type ChildMap } from "../server/routes.js";
import { graph, registry, itemBank, anchors, store } from "../server/state.js";
import { isCovered } from "../src/engine/candidates.js";
import { selectNext } from "../src/engine/engine.js";
import { buildObservation } from "../src/sdk/observation.js";
import type { EvidenceBundle, Observation } from "../src/contracts/schemas.js";
import type { BeliefInternal, BeliefStatus } from "../src/store/types.js";

/**
 * GET /api/child/map/:studentId -- the child's Star Path payload. These
 * tests assert shape and invariants (authored-only, no probabilities, one
 * `next` that satisfies the eligibility rule) rather than exact tiers, so
 * they stay valid while the mastery gate in src/store/projector.ts evolves.
 * Same real-router-over-HTTP + data-file snapshot/restore approach as
 * tests/routes.test.ts.
 */
const DATA_FILE = fileURLToPath(new URL("../.data/evidence-log.jsonl", import.meta.url));
const originalContent = existsSync(DATA_FILE) ? readFileSync(DATA_FILE, "utf-8") : null;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", api);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (originalContent === null) {
    rmSync(DATA_FILE, { force: true });
  } else {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    writeFileSync(DATA_FILE, originalContent);
  }
});

const rand = () => Math.random().toString(36).slice(2, 10);

async function getMap(studentId: string): Promise<{ raw: string; body: ChildMap }> {
  const res = await fetch(`${baseUrl}/child/map/${studentId}`);
  expect(res.status).toBe(200);
  const raw = await res.text();
  return { raw, body: JSON.parse(raw) as ChildMap };
}

const authoredIds = [...graph.nodes.values()].filter((n) => n.status === "authored").map((n) => n.concept_id);
const TIERS = ["seed", "glow", "bloom", "fading"];

function assertInvariants(map: ChildMap, raw: string, studentId: string) {
  // No probabilities, counts, or ranks reach the child browser.
  for (const forbidden of ["p_mastery", "p_decayed", "confidence", "observations_n", "attempts_without_mastery", "status", "signatures", "label"]) {
    expect(raw).not.toContain(`"${forbidden}"`);
  }
  for (const c of map.concepts) {
    expect(Object.keys(c).sort()).toEqual(["concept_id", "next", "strand", "tier"]);
  }
  expect(Object.keys(map).sort()).toEqual(["concepts", "edges", "nextKind", "strands", "student_id"]);
  for (const c of map.concepts) {
    expect(TIERS).toContain(c.tier);
  }

  // Exactly the authored concepts, each once, no stubs.
  expect(map.concepts.map((c) => c.concept_id).sort()).toEqual([...authoredIds].sort());
  expect(map.strands.flatMap((s) => s.concept_ids).sort()).toEqual([...authoredIds].sort());

  // Every graph strand is listed; a strand with no authored content is only a "coming later" hint.
  const graphStrands = new Set([...graph.nodes.values()].map((n) => n.strand));
  expect(new Set(map.strands.map((s) => s.strand))).toEqual(graphStrands);
  for (const s of map.strands) {
    const stubs = [...graph.nodes.values()].filter((n) => n.strand === s.strand && n.status === "stub");
    expect(s.hasComingLater).toBe(stubs.length > 0);
    if (s.concept_ids.length === 0) expect(s.hasComingLater).toBe(true);
  }

  // Within a strand, a same-strand prerequisite always comes before its dependent.
  for (const e of map.edges) {
    expect(authoredIds).toContain(e.from);
    expect(authoredIds).toContain(e.to);
    const from = graph.node(e.from)!;
    const to = graph.node(e.to)!;
    if (from.strand !== to.strand) continue;
    const order = map.strands.find((s) => s.strand === from.strand)!.concept_ids;
    expect(order.indexOf(e.to)).toBeLessThan(order.indexOf(e.from));
  }

  // At most one `next`, and it satisfies the status-based eligibility rule
  // (see buildChildMap in server/routes.ts):
  //   own status in {EMERGING, UNTESTED, DECAYED} (never MASTERED),
  //   every hard prerequisite MASTERED or DECAYED, authored, covered.
  // It is the engine's top concept for the student's next session when that
  // concept is eligible (the glowing star is what Play serves); otherwise the
  // best eligible by preference EMERGING > DECAYED > UNTESTED. If nothing
  // qualifies there is no `next`.
  // Exception (BACKLOG.md Decision D1): when the engine's top concept is
  // STUCK (served only through its wheel-spin relaxation), `next` is that
  // concept with nextKind "practice". Every other `next` is "grow"; nextKind
  // is null exactly when there is no `next`.
  const nexts = map.concepts.filter((c) => c.next);
  expect(nexts.length).toBeLessThanOrEqual(1);
  expect(["grow", "practice", null]).toContain(map.nextKind);
  expect(map.nextKind === null).toBe(nexts.length === 0);
  const top = engineTop(studentId);
  if (top !== undefined && statusOf(studentId, top) === "STUCK") {
    expect(nexts.map((c) => c.concept_id)).toEqual([top]);
    expect(map.nextKind).toBe("practice");
    expect(nexts[0].tier).toBe("glow");
    return;
  }
  expect(map.nextKind).not.toBe("practice");
  const eligible = eligibleForNext(studentId);
  if (eligible.length > 0) {
    expect(nexts.length).toBe(1);
    expect(eligible).toContain(nexts[0].concept_id);
    expect(nexts[0].tier).not.toBe("bloom");
    if (top !== undefined && eligible.includes(top)) {
      expect(nexts[0].concept_id).toBe(top);
    } else {
      const best = Math.min(...eligible.map((id) => PREFERENCE[statusOf(studentId, id)]!));
      expect(PREFERENCE[statusOf(studentId, nexts[0].concept_id)]).toBe(best);
    }
  } else {
    expect(nexts.length).toBe(0);
  }
}

const PREFERENCE: Partial<Record<BeliefStatus, number>> = { EMERGING: 0, DECAYED: 1, UNTESTED: 2 };

function statusOf(studentId: string, conceptId: string): BeliefStatus {
  return store.belief(studentId).get(conceptId)?.status ?? "UNTESTED";
}

/** The top concept of the session GET /api/assignment would serve right now (same seed, same belief). */
function engineTop(studentId: string): string | undefined {
  return selectNext({ studentId, graph, belief: store.belief(studentId), registry, itemBank, anchors, seed: nextSessionSeed(studentId) }).assignment
    ?.concepts[0];
}

async function getAssignmentTop(studentId: string): Promise<string | undefined> {
  const res = await fetch(`${baseUrl}/assignment/${studentId}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { assignment?: { concepts: string[]; assignment_id: string } };
  return body.assignment?.concepts[0];
}

function eligibleForNext(studentId: string): string[] {
  return authoredIds.filter(
    (id) =>
      PREFERENCE[statusOf(studentId, id)] !== undefined &&
      graph.data.requires
        .filter((e) => e.from === id && e.strength === "hard")
        .every((e) => ["MASTERED", "DECAYED"].includes(statusOf(studentId, e.to))) &&
      isCovered(graph, registry, itemBank, id),
  );
}

/**
 * Stub the store's projection with hand-set statuses so the eligibility
 * edge cases (STUCK, DECAYED, EMERGING-over-threshold) can be pinned down
 * without depending on decay timing or the mastery gate's exact numbers.
 * Concepts not listed are absent from the belief map (UNTESTED).
 */
function stubBelief(studentId: string, statuses: Record<string, { status: BeliefStatus; p_mastery?: number }>) {
  const map = new Map<string, BeliefInternal>();
  for (const [concept_id, { status, p_mastery }] of Object.entries(statuses)) {
    const threshold = graph.node(concept_id)!.mastery_threshold;
    const p = p_mastery ?? (status === "MASTERED" || status === "DECAYED" ? Math.min(1, threshold + 0.05) : threshold / 2);
    map.set(concept_id, {
      student_id: studentId,
      concept_id,
      p_mastery: p,
      confidence: 0.5,
      observations_n: 6,
      last_observed: "2026-01-01",
      p_decayed: status === "DECAYED" ? threshold / 2 : p,
      signatures: [],
      attempts_without_mastery: status === "STUCK" ? 3 : 0,
      status,
    });
  }
  vi.spyOn(store, "belief").mockImplementation((id: string) => (id === studentId ? map : new Map()));
}

function localMap(studentId: string): { raw: string; body: ChildMap } {
  const body = buildChildMap(studentId);
  return { raw: JSON.stringify(body), body };
}

const allMasteredExcept = (overrides: Record<string, { status: BeliefStatus; p_mastery?: number } | null>) => {
  const out: Record<string, { status: BeliefStatus; p_mastery?: number }> = {};
  for (const id of authoredIds) {
    if (id in overrides) {
      if (overrides[id]) out[id] = overrides[id]!;
    } else {
      out[id] = { status: "MASTERED" };
    }
  }
  return out;
};

function obs(itemId: string, conceptId: string, i: number, verdict: "correct" | "incorrect"): Observation {
  return buildObservation({
    item_id: itemId,
    concept_id: conceptId,
    difficulty: 0.3,
    response: { kind: "choice", value: "a", target: verdict === "correct" ? "a" : "b" },
    verdict,
    signature: "UNCLASSIFIED",
    signature_confidence: 0,
    startedAtMs: i * 1000,
    endedAtMs: i * 1000 + 2000,
    attempts: 1,
  });
}

async function postBundle(studentId: string, observations: Observation[]) {
  const bundle: EvidenceBundle = {
    session_id: `ses_${rand()}`,
    student_id: studentId,
    assignment_id: `asg_${rand()}`,
    game_id: "fractionbars.compare.v1",
    started_at: new Date(Date.now() - 60_000).toISOString(),
    ended_at: new Date().toISOString(),
    observations,
    engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
  };
  const res = await fetch(`${baseUrl}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bundle),
  });
  expect(res.status).toBe(200);
}

describe("GET /api/child/map/:studentId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a brand-new student sees every authored concept as a seed, with one covered root glowing as next", async () => {
    const studentId = `stu_map_${rand()}`;
    const { raw, body } = await getMap(studentId);
    assertInvariants(body, raw, studentId);
    expect(body.student_id).toBe(studentId);
    expect(body.concepts.every((c) => c.tier === "seed")).toBe(true);

    const next = body.concepts.find((c) => c.next)!;
    expect(next).toBeDefined();
    const hardReqs = graph.data.requires.filter((e) => e.from === next.concept_id && e.strength === "hard");
    expect(hardReqs).toEqual([]);
  });

  it("keeps its invariants after real evidence moves a concept off seed", async () => {
    const studentId = `stu_map_${rand()}`;
    const observations = Array.from({ length: 6 }, (_, i) => obs(`itm_gp_test_${i}`, "G.PART", i, "correct"));
    await postBundle(studentId, observations);

    const { raw, body } = await getMap(studentId);
    assertInvariants(body, raw, studentId);
    const gpart = body.concepts.find((c) => c.concept_id === "G.PART")!;
    expect(gpart.tier).not.toBe("seed");
  });

  it("never points `next` at a concept whose status is MASTERED", async () => {
    const studentId = `stu_map_${rand()}`;
    const observations = Array.from({ length: 10 }, (_, i) => obs(`itm_nc_test_${i}`, "N.COUNT", i, "correct"));
    await postBundle(studentId, observations);

    const { raw, body } = await getMap(studentId);
    assertInvariants(body, raw, studentId);
    const belief = store.belief(studentId);
    for (const c of body.concepts.filter((x) => x.next)) {
      expect(belief.get(c.concept_id)?.status).not.toBe("MASTERED");
    }
    if (belief.get("N.COUNT")?.status === "MASTERED") {
      expect(body.concepts.find((c) => c.concept_id === "N.COUNT")!.tier).toBe("bloom");
    }
  });

  it("contains no digits outside ids and edge metadata (nothing numeric for the child to render)", async () => {
    const { body } = await getMap(`stu_map_${rand()}`);
    const visibleish = JSON.stringify({ strands: body.strands.map((s) => s.strand), concepts: body.concepts.map((c) => [c.concept_id, c.tier]) });
    expect(visibleish).not.toMatch(/[0-9]/);
  });

  it("D1: a student whose only servable concepts are STUCK gets the relaxed concept Play serves as `next`, kind practice", async () => {
    const studentId = `stu_map_${rand()}`;
    // Both roots STUCK; everything above them is UNTESTED, so its hard prerequisites are unmet.
    stubBelief(studentId, { "N.COUNT": { status: "STUCK" }, "G.PART": { status: "STUCK" } });
    const served = await getAssignmentTop(studentId);
    expect(["N.COUNT", "G.PART"]).toContain(served);
    const { raw, body } = await getMap(studentId);
    assertInvariants(body, raw, studentId);
    expect(body.concepts.filter((c) => c.next).map((c) => c.concept_id)).toEqual([served]);
    expect(body.nextKind).toBe("practice");
    // Tiers only: nothing on the payload names the state.
    expect(raw).not.toMatch(/stuck/i);
  });

  it("a DECAYED concept whose hard prerequisites are mastered can be `next`", () => {
    const studentId = `stu_map_${rand()}`;
    stubBelief(studentId, allMasteredExcept({ "N.ORD": { status: "DECAYED" } }));
    const { raw, body } = localMap(studentId);
    assertInvariants(body, raw, studentId);
    const next = body.concepts.find((c) => c.next)!;
    expect(next.concept_id).toBe("N.ORD");
    expect(next.tier).toBe("fading");
  });

  it("with several eligible stars (DECAYED and fresh seeds), `next` follows the engine's top concept, not a map-only preference", () => {
    const studentId = `stu_map_${rand()}`;
    // N.ORD fading; N.MAG and N.PLACE are UNTESTED and also eligible (a DECAYED prereq counts as satisfied).
    stubBelief(
      studentId,
      allMasteredExcept({
        "N.ORD": { status: "DECAYED" },
        "N.MAG": null,
        "N.PLACE": null,
        "N.PLACE.HTH": null,
        "D.NOTATE": null,
        "D.MAG": null,
        "D.MAG.CMP": null,
      }),
    );
    expect(eligibleForNext(studentId)).toEqual(expect.arrayContaining(["N.ORD", "N.MAG", "N.PLACE"]));
    const top = engineTop(studentId);
    expect(eligibleForNext(studentId)).toContain(top);
    const { raw, body } = localMap(studentId);
    assertInvariants(body, raw, studentId);
    expect(body.concepts.find((c) => c.next)!.concept_id).toBe(top);
  });

  it("an EMERGING prerequisite over the p threshold still blocks its successor from glowing", () => {
    const studentId = `stu_map_${rand()}`;
    const threshold = graph.node("N.COUNT")!.mastery_threshold;
    // N.COUNT has p_mastery over threshold but hasn't met the recent-evidence floor, so it is EMERGING.
    // G.PART is STUCK, so the only other root can't glow either.
    stubBelief(studentId, { "N.COUNT": { status: "EMERGING", p_mastery: Math.min(1, threshold + 0.05) }, "G.PART": { status: "STUCK" } });
    const { raw, body } = localMap(studentId);
    assertInvariants(body, raw, studentId);
    // The engine gates prerequisites on the same status rule (exported
    // prereqsMet), so it doesn't lead with N.ORD either, and neither does the map.
    expect(engineTop(studentId)).not.toBe("N.ORD");
    expect(body.concepts.find((c) => c.concept_id === "N.ORD")!.next).toBe(false);
    // Whatever glows is what Play leads with: the relaxed STUCK root
    // ("practice") if the engine falls back to it, otherwise N.COUNT ("grow").
    const next = body.concepts.filter((c) => c.next).map((c) => c.concept_id);
    if (body.nextKind === "practice") {
      expect(next).toEqual(["G.PART"]);
      expect(engineTop(studentId)).toBe("G.PART");
    } else {
      expect(next).toEqual(["N.COUNT"]);
    }
  });

  it("never glows a STUCK concept Play won't lead with, even when its prerequisites are all mastered (kind grow for the real next)", () => {
    const studentId = `stu_map_${rand()}`;
    // F.EQV is STUCK, but N.ORD (fading) is servable, so the engine never relaxes F.EQV.
    stubBelief(studentId, allMasteredExcept({ "F.EQV": { status: "STUCK" }, "N.ORD": { status: "DECAYED" } }));
    expect(engineTop(studentId)).not.toBe("F.EQV");
    const { raw, body } = localMap(studentId);
    assertInvariants(body, raw, studentId);
    expect(body.concepts.find((c) => c.concept_id === "F.EQV")!.next).toBe(false);
    expect(body.concepts.filter((c) => c.next)).toHaveLength(1);
    expect(body.nextKind).toBe("grow");
  });

  it("D1: a STUCK concept with every prerequisite mastered, served by Play through relaxation, glows as practice", () => {
    const studentId = `stu_map_${rand()}`;
    stubBelief(studentId, allMasteredExcept({ "F.EQV": { status: "STUCK" } }));
    const top = engineTop(studentId);
    const { raw, body } = localMap(studentId);
    assertInvariants(body, raw, studentId);
    expect(top).toBe("F.EQV");
    expect(body.concepts.filter((c) => c.next).map((c) => c.concept_id)).toEqual(["F.EQV"]);
    expect(body.nextKind).toBe("practice");
  });

  it("an ordinary eligible `next` is kind grow, and no `next` means nextKind null", () => {
    const fresh = `stu_map_${rand()}`;
    expect(buildChildMap(fresh).nextKind).toBe("grow");

    const doneStudent = `stu_map_${rand()}`;
    stubBelief(doneStudent, allMasteredExcept({}));
    const { raw, body } = localMap(doneStudent);
    assertInvariants(body, raw, doneStudent);
    expect(body.concepts.some((c) => c.next)).toBe(false);
    expect(body.nextKind).toBeNull();
  });
});

describe("D1: map `next` is the top concept of the session Play serves, and peeking never shifts it", () => {
  it("a new student's map `next` equals GET /assignment's top concept, across repeated map, tutor-peek and other-student calls", async () => {
    const studentId = `stu_map_${rand()}`;
    const other = `stu_map_${rand()}`;
    const first = (await getMap(studentId)).body.concepts.find((c) => c.next)?.concept_id;
    expect(first).toBeDefined();
    type Served = { assignment: { assignment_id: string; item_specs: unknown[] } };
    const firstAssignment = (await (await fetch(`${baseUrl}/assignment/${studentId}`)).json()) as Served;
    for (let i = 0; i < 4; i++) {
      await getMap(studentId);
      await getAssignmentTop(studentId); // the tutor's "Why this next" call
      await getAssignmentTop(other); // another child's Play
      await getMap(other);
    }
    expect((await getMap(studentId)).body.concepts.find((c) => c.next)?.concept_id).toBe(first);
    expect(await getAssignmentTop(studentId)).toBe(first);
    const again = (await (await fetch(`${baseUrl}/assignment/${studentId}`)).json()) as Served;
    expect(again.assignment.assignment_id).toBe(firstAssignment.assignment.assignment_id);
    expect(again.assignment.item_specs).toEqual(firstAssignment.assignment.item_specs);
  });

  it("the rotation seed advances only when that student submits evidence", async () => {
    const studentId = `stu_map_${rand()}`;
    const other = `stu_map_${rand()}`;
    const before = nextSessionSeed(studentId);
    await getAssignmentTop(studentId);
    await postBundle(other, [obs(`itm_gp_seed_${rand()}`, "G.PART", 0, "correct")]);
    expect(nextSessionSeed(studentId)).toBe(before);
    await postBundle(studentId, [obs(`itm_gp_seed_${rand()}`, "G.PART", 0, "correct")]);
    expect(nextSessionSeed(studentId)).not.toBe(before);

    // Still in agreement after real evidence moved belief.
    const { raw, body } = await getMap(studentId);
    assertInvariants(body, raw, studentId);
    const next = body.concepts.find((c) => c.next)?.concept_id;
    const top = await getAssignmentTop(studentId);
    if (next !== undefined && top !== undefined && eligibleForNext(studentId).includes(top)) expect(next).toBe(top);
  });
});

describe("D1 (Cycle 19 lane R): map `next` is never null while GET /assignment serves items", () => {
  // Measured before this change on a fresh seed, 12 driven sessions x 6 kids:
  // 5/72 (~85% accuracy) and 4/72 (~45%) served sessions had `next` null, every
  // one with a relaxed STUCK top concept (devon G.PART / N.ORD).
  async function servedAndMap(studentId: string) {
    const res = await fetch(`${baseUrl}/assignment/${studentId}`);
    const body = (await res.json()) as { assignment?: { concepts: string[]; item_specs: unknown[] } };
    const map = await getMap(studentId);
    return { assignment: body.assignment, map };
  }

  it("real evidence: a child who wheel-spins on both roots gets the relaxed concept Play serves as `next` (practice), session after session", async () => {
    const studentId = `stu_map_${rand()}`;
    // Three low-accuracy sessions on each root -> both roots STUCK, nothing above them unlocked.
    for (let session = 0; session < 3; session++) {
      const observations = ["G.PART", "N.COUNT"].flatMap((c) =>
        Array.from({ length: 4 }, (_, i) => obs(`itm_stuck_${c}_${session}_${i}`, c, i, i === 0 ? "correct" : "incorrect")),
      );
      await postBundle(studentId, observations);
    }
    expect(statusOf(studentId, "G.PART")).toBe("STUCK");
    expect(statusOf(studentId, "N.COUNT")).toBe("STUCK");

    for (let round = 0; round < 4; round++) {
      const { assignment, map } = await servedAndMap(studentId);
      assertInvariants(map.body, map.raw, studentId);
      expect(assignment?.item_specs.length ?? 0).toBeGreaterThan(0);
      const top = assignment!.concepts[0];
      expect(statusOf(studentId, top)).toBe("STUCK");
      expect(map.body.concepts.filter((c) => c.next).map((c) => c.concept_id)).toEqual([top]);
      expect(map.body.nextKind).toBe("practice");
      // Another struggling session on what was served; the concept stays STUCK.
      await postBundle(studentId, Array.from({ length: 4 }, (_, i) => obs(`itm_stuck_more_${round}_${i}`, top, i, i === 0 ? "correct" : "incorrect")));
    }
  });

  it("hand-set cohort shapes: whenever the assignment serves items, `next` is set and is the served top concept's kind", async () => {
    const shapes: Record<string, { status: BeliefStatus; p_mastery?: number }>[] = [
      {},
      { "N.COUNT": { status: "STUCK" }, "G.PART": { status: "STUCK" } },
      { "N.COUNT": { status: "MASTERED" }, "G.PART": { status: "STUCK" }, "N.ORD": { status: "STUCK" } },
      { "N.COUNT": { status: "EMERGING" }, "G.PART": { status: "STUCK" } },
      allMasteredExcept({ "F.EQV": { status: "STUCK" } }),
      allMasteredExcept({ "F.EQV": { status: "STUCK" }, "N.ORD": { status: "DECAYED" } }),
      allMasteredExcept({ "N.ORD": { status: "DECAYED" }, "N.MAG": null, "N.PLACE": null }),
    ];
    for (const shape of shapes) {
      const studentId = `stu_map_${rand()}`;
      stubBelief(studentId, shape);
      const { assignment, map } = await servedAndMap(studentId);
      assertInvariants(map.body, map.raw, studentId);
      if ((assignment?.item_specs.length ?? 0) > 0) {
        const next = map.body.concepts.filter((c) => c.next);
        expect(next).toHaveLength(1);
        const top = assignment!.concepts[0];
        if (statusOf(studentId, top) === "STUCK") {
          expect(next[0].concept_id).toBe(top);
          expect(map.body.nextKind).toBe("practice");
        } else {
          expect(map.body.nextKind).toBe("grow");
        }
      }
      vi.restoreAllMocks();
    }
  });
});
