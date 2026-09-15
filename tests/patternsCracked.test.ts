import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { api, diffPatternsCracked } from "../server/routes.js";
import { metaOf } from "../server/state.js";
import { LearnerStore } from "../src/store/store.js";
import { buildObservation } from "../src/sdk/observation.js";
import type { EvidenceBundle, Observation } from "../src/contracts/schemas.js";

/**
 * "Pattern cracked" (BACKLOG.md E2): POST /api/evidence reports a concept
 * when a misconception signature the child showed >= 2 times on it before
 * this session is absent from a session that worked the concept (>= 2 obs)
 * and was mostly correct. One-shot per recurrence of the signature, and the
 * response never carries the signature code.
 *
 * Pure-function tests run against an in-memory LearnerStore; the route tests
 * use the real router over HTTP with the same .data snapshot/restore as
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
const now = () => new Date().toISOString();

// F.MAG.UNIT number-line items (src/games/numberline/items.ts): placing 1/8
// near 0.8 is the item's own WHOLE_NUMBER_BIAS claim.
function wnbMiss(): Observation {
  return buildObservation({
    item_id: "itm_fu_1_8",
    concept_id: "F.MAG.UNIT",
    difficulty: 0.5,
    response: { kind: "position", value: 0.8, target: 0.125 },
    verdict: "incorrect",
    signature: "WHOLE_NUMBER_BIAS",
    signature_confidence: 0.85,
    startedAtMs: 0,
    endedAtMs: 4000,
    attempts: 1,
  });
}
function unitHit(): Observation {
  return buildObservation({
    item_id: "itm_fu_1_8",
    concept_id: "F.MAG.UNIT",
    difficulty: 0.5,
    response: { kind: "position", value: 0.13, target: 0.125 },
    verdict: "correct",
    signature: "UNCLASSIFIED",
    signature_confidence: 0,
    startedAtMs: 0,
    endedAtMs: 4000,
    attempts: 1,
  });
}
function unitUnclassifiedMiss(): Observation {
  return { ...unitHit(), verdict: "incorrect", response: { kind: "position", value: 0.5, target: 0.125 } };
}

function bundle(studentId: string, observations: Observation[]): EvidenceBundle {
  const at = now();
  return {
    session_id: `ses_${rand()}`,
    student_id: studentId,
    assignment_id: `asg_${rand()}`,
    game_id: "numberline.place.v2",
    started_at: at,
    ended_at: at,
    observations,
    engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
  };
}

/** Ingests `history` into a fresh in-memory store, then diffs `next` against it. */
function crackedAfter(history: Observation[][], next: Observation[]) {
  const store = new LearnerStore(metaOf);
  const studentId = `stu_${rand()}`;
  for (const obs of history) store.ingest(bundle(studentId, obs));
  return diffPatternsCracked(store.belief(studentId), store.bundlesFor(studentId), bundle(studentId, next));
}

describe("diffPatternsCracked", () => {
  it("fires when a count-2 WHOLE_NUMBER_BIAS on F.MAG.UNIT is absent from a mostly-correct session", () => {
    expect(crackedAfter([[wnbMiss(), wnbMiss(), unitHit()]], [unitHit(), unitHit(), unitUnclassifiedMiss()])).toEqual([
      { concept_id: "F.MAG.UNIT", code: "WHOLE_NUMBER_BIAS" },
    ]);
  });

  it("counts the signature across earlier sessions, not just one", () => {
    expect(crackedAfter([[wnbMiss(), unitHit()], [wnbMiss()]], [unitHit(), unitHit()])).toHaveLength(1);
  });

  it("does not fire on a first-ever session, even a clean one", () => {
    expect(crackedAfter([], [unitHit(), unitHit(), unitHit()])).toEqual([]);
  });

  it("does not fire when the signature was only seen once before", () => {
    expect(crackedAfter([[wnbMiss(), unitHit()]], [unitHit(), unitHit()])).toEqual([]);
  });

  it("does not fire when the signature recurs in the session, even if mostly correct", () => {
    expect(crackedAfter([[wnbMiss(), wnbMiss()]], [unitHit(), unitHit(), unitHit(), wnbMiss()])).toEqual([]);
  });

  it("does not fire with fewer than two observations on the concept", () => {
    expect(crackedAfter([[wnbMiss(), wnbMiss()]], [unitHit()])).toEqual([]);
  });

  it("does not fire when the session is not mostly correct (half is not most)", () => {
    expect(crackedAfter([[wnbMiss(), wnbMiss()]], [unitHit(), unitUnclassifiedMiss()])).toEqual([]);
  });

  it("is one-shot: a second clean session doesn't re-fire, but a relapse then a new clean session does", () => {
    const history = [[wnbMiss(), wnbMiss()], [unitHit(), unitHit()]]; // the second session already cracked it
    expect(crackedAfter(history, [unitHit(), unitHit()])).toEqual([]);
    expect(crackedAfter([...history, [wnbMiss(), unitHit()]], [unitHit(), unitHit()])).toHaveLength(1);
  });
});

async function postEvidence(b: EvidenceBundle): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl}/evidence`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/evidence: patternsCracked", () => {
  it("returns the concept (and never the signature code) on the cracking session only", async () => {
    const studentId = `stu_${rand()}`;
    const first = await postEvidence(bundle(studentId, [wnbMiss(), wnbMiss(), unitHit()]));
    expect(first.patternsCracked).toEqual([]);

    const crackBundle = bundle(studentId, [unitHit(), unitHit(), unitHit()]);
    const cracked = await postEvidence(crackBundle);
    expect(cracked.patternsCracked).toEqual([{ concept_id: "F.MAG.UNIT" }]);
    expect(JSON.stringify(cracked)).not.toContain("WHOLE_NUMBER_BIAS");

    // Re-sending the same bundle is a duplicate: nothing cracks again.
    const dup = await postEvidence(crackBundle);
    expect(dup.duplicate).toBe(true);
    expect(dup.patternsCracked).toEqual([]);

    // Another clean session: already cracked, no repeat beat.
    const again = await postEvidence(bundle(studentId, [unitHit(), unitHit()]));
    expect(again.patternsCracked).toEqual([]);
  });

  it("stays empty for a bundle where the signature repeats", async () => {
    const studentId = `stu_${rand()}`;
    await postEvidence(bundle(studentId, [wnbMiss(), wnbMiss()]));
    const res = await postEvidence(bundle(studentId, [unitHit(), unitHit(), unitHit(), wnbMiss()]));
    expect(res.patternsCracked).toEqual([]);
  });
});
