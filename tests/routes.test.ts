import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "../server/routes.js";
import { graph } from "../server/state.js";
import { blame } from "../src/graph/query.js";
import { buildObservation } from "../src/sdk/observation.js";
import type { EvidenceBundle, Observation } from "../src/contracts/schemas.js";

/**
 * `server/routes.ts` wires its router straight to the process-wide
 * singletons in `server/state.ts`, including a real (gitignored) data file
 * at .data/evidence-log.jsonl -- see server/state.ts's DATA_DIR and
 * scripts/seed.ts, which populates that same file for the manual demo.
 * Rather than fork the routing logic to inject a fake store, these tests
 * exercise the actual `api` router over real HTTP (same as the manual curl
 * verification the diff shipped with), and snapshot/restore that file so
 * `npm test` never leaves synthetic evidence behind for the real demo
 * cohort, whether or not a developer has already run `npm run seed`.
 */
const DATA_FILE = fileURLToPath(new URL("../.data/evidence-log.jsonl", import.meta.url));
const existedBefore = existsSync(DATA_FILE);
const originalContent = existedBefore ? readFileSync(DATA_FILE, "utf-8") : null;

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

// A fresh, random student/session/assignment id per bundle, so these tests
// never collide with the seeded demo directory (stu_maya, etc.) or with
// leftovers from a previous, uncleanly-terminated test run.
const rand = () => Math.random().toString(36).slice(2, 10);

function evidenceBundle(overrides: Partial<EvidenceBundle> & { student_id: string; session_id: string }): EvidenceBundle {
  return {
    assignment_id: `asg_${rand()}`,
    game_id: "fractionbars.compare.v1",
    started_at: "2026-01-01T00:00:00.000Z",
    ended_at: "2026-01-01T00:05:00.000Z",
    observations: [],
    engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
    ...overrides,
  };
}

async function postEvidence(bundle: EvidenceBundle): Promise<{ status: number; body: { accepted: boolean; duplicate: boolean; errors?: string[] } }> {
  const res = await fetch(`${baseUrl}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bundle),
  });
  return { status: res.status, body: (await res.json()) as { accepted: boolean; duplicate: boolean; errors?: string[] } };
}

interface SessionSummary {
  session_id: string;
  game_id: string;
  started_at: string;
  ended_at: string;
  completed: boolean;
  item_count: number;
  correct_count: number;
  concept_ids: string[];
}

interface ObservationDetail {
  item_id: string;
  concept_id: string;
  concept_label: string;
  difficulty: number;
  verdict: "correct" | "incorrect";
  prompt_label: string;
  student_answer_label: string;
  correct_answer_label: string;
  signature: string;
  signature_confidence: number;
  signature_meaning: string | null;
  blamed_concepts: { concept_id: string; label: string }[];
  latency_ms: number;
  attempts: number;
  flags: string[];
}

interface SessionDetail {
  session_id: string;
  student_id: string;
  game_id: string;
  started_at: string;
  ended_at: string;
  completed: boolean;
  observations: ObservationDetail[];
}

// The item bank's own fixtures (see src/games/*/items.ts), reused here
// rather than re-declared, so these tests fail loudly if the diff's
// describeResponse() ever drifts from the real item content it reads.
const COMPARE_ITEM_ID = "itm_fb_1_3v1_8"; // a=1/3, b=1/8, correct="a"
const PARTITION_ITEM_ID = "itm_gp_halves"; // parts=2, correct="a"
const NUMBERLINE_ITEM_ID = "itm_fu_1_8"; // F.MAG.UNIT, target 0.125, scale [0,1]

function wrongCompareObservation(): Observation {
  return buildObservation({
    item_id: COMPARE_ITEM_ID,
    concept_id: "F.MAG.CMP",
    difficulty: 0.4,
    response: { kind: "choice", value: "b", target: "a" },
    verdict: "incorrect",
    signature: "WHOLE_NUMBER_BIAS",
    signature_confidence: 0.9,
    startedAtMs: 0,
    endedAtMs: 3000,
    attempts: 1,
  });
}

function correctPartitionObservation(): Observation {
  return buildObservation({
    item_id: PARTITION_ITEM_ID,
    concept_id: "G.PART",
    difficulty: 0.2,
    response: { kind: "choice", value: "a", target: "a" },
    verdict: "correct",
    signature: "UNCLASSIFIED",
    signature_confidence: 0,
    startedAtMs: 0,
    endedAtMs: 2000,
    attempts: 1,
  });
}

function wrongNumberlineObservation(): Observation {
  return buildObservation({
    item_id: NUMBERLINE_ITEM_ID,
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

describe("GET /api/sessions/:studentId", () => {
  it("returns an empty list for a student with no evidence, rather than 404ing", async () => {
    const res = await fetch(`${baseUrl}/sessions/stu_unknown_${rand()}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("summarises a session's item/correct counts and distinct concepts", async () => {
    const studentId = `stu_${rand()}`;
    const bundle = evidenceBundle({
      student_id: studentId,
      session_id: `ses_${rand()}`,
      observations: [wrongCompareObservation(), correctPartitionObservation()],
    });
    const posted = await postEvidence(bundle);
    expect(posted.status).toBe(200);
    expect(posted.body.accepted).toBe(true);

    const res = await fetch(`${baseUrl}/sessions/${studentId}`);
    expect(res.status).toBe(200);
    const summaries = (await res.json()) as SessionSummary[];
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      session_id: bundle.session_id,
      game_id: "fractionbars.compare.v1",
      completed: true,
      item_count: 2,
      correct_count: 1,
    });
    expect(new Set(summaries[0].concept_ids)).toEqual(new Set(["F.MAG.CMP", "G.PART"]));
  });

  it("orders multiple sessions newest first", async () => {
    const studentId = `stu_${rand()}`;
    const older = evidenceBundle({
      student_id: studentId,
      session_id: `ses_${rand()}_older`,
      started_at: "2026-01-01T00:00:00.000Z",
      ended_at: "2026-01-01T00:01:00.000Z",
      observations: [correctPartitionObservation()],
    });
    const newer = evidenceBundle({
      student_id: studentId,
      session_id: `ses_${rand()}_newer`,
      started_at: "2026-02-01T00:00:00.000Z",
      ended_at: "2026-02-01T00:01:00.000Z",
      observations: [correctPartitionObservation()],
    });
    // Posted out of chronological order on purpose -- the route must sort
    // by started_at, not by ingestion order.
    await postEvidence(newer);
    await postEvidence(older);

    const res = await fetch(`${baseUrl}/sessions/${studentId}`);
    const summaries = (await res.json()) as SessionSummary[];
    expect(summaries.map((s) => s.session_id)).toEqual([newer.session_id, older.session_id]);
  });
});

describe("GET /api/sessions/:studentId/:sessionId", () => {
  it("returns 404 for an unknown session, both for a known and an unknown student", async () => {
    const studentId = `stu_${rand()}`;
    await postEvidence(
      evidenceBundle({ student_id: studentId, session_id: `ses_${rand()}`, observations: [correctPartitionObservation()] }),
    );

    const missingSessionForKnownStudent = await fetch(`${baseUrl}/sessions/${studentId}/ses_does_not_exist`);
    expect(missingSessionForKnownStudent.status).toBe(404);
    expect(await missingSessionForKnownStudent.json()).toEqual({ error: "unknown session" });

    const unknownStudentEntirely = await fetch(`${baseUrl}/sessions/stu_unknown_${rand()}/ses_does_not_exist`);
    expect(unknownStudentEntirely.status).toBe(404);
  });

  it("describes an incorrect fraction-compare response in tutor-readable prose, with its blamed root cause", async () => {
    const studentId = `stu_${rand()}`;
    const sessionId = `ses_${rand()}`;
    await postEvidence(
      evidenceBundle({ student_id: studentId, session_id: sessionId, observations: [wrongCompareObservation()] }),
    );

    const res = await fetch(`${baseUrl}/sessions/${studentId}/${sessionId}`);
    expect(res.status).toBe(200);
    const detail = (await res.json()) as SessionDetail;
    expect(detail.session_id).toBe(sessionId);
    expect(detail.observations).toHaveLength(1);

    const [observation] = detail.observations;
    expect(observation).toMatchObject({
      item_id: COMPARE_ITEM_ID,
      concept_id: "F.MAG.CMP",
      verdict: "incorrect",
      prompt_label: "Which is bigger: 1/3 or 1/8?",
      student_answer_label: "Chose 1/8",
      correct_answer_label: "1/3",
      signature: "WHOLE_NUMBER_BIAS",
    });
    // Plain-English signature explanation (SIGNATURE_MEANINGS), not just the raw code.
    expect(observation.signature_meaning).toMatch(/whole number/i);

    // blame() is the same helper /api/belief uses -- the route must trace
    // this observation's concept+signature back through the real graph,
    // not hand-roll its own copy of the misconception->prerequisite map.
    const expectedBlame = blame(graph, "F.MAG.CMP", "WHOLE_NUMBER_BIAS");
    expect(expectedBlame.length).toBeGreaterThan(0); // sanity: this fixture is expected to have a blame edge
    expect(observation.blamed_concepts).toEqual(
      expectedBlame.map((s) => ({ concept_id: s.concept_id, label: graph.node(s.concept_id)?.label ?? s.concept_id })),
    );
  });

  it("leaves signature_meaning null and blamed_concepts empty for a correct response", async () => {
    const studentId = `stu_${rand()}`;
    const sessionId = `ses_${rand()}`;
    await postEvidence(
      evidenceBundle({ student_id: studentId, session_id: sessionId, observations: [correctPartitionObservation()] }),
    );

    const res = await fetch(`${baseUrl}/sessions/${studentId}/${sessionId}`);
    const detail = (await res.json()) as SessionDetail;
    const [observation] = detail.observations;
    expect(observation).toMatchObject({
      verdict: "correct",
      prompt_label: "Which shape shows equal halves?",
      student_answer_label: "Chose shape A",
      correct_answer_label: "Shape A",
      signature: "UNCLASSIFIED",
      signature_meaning: null,
    });
    expect(observation.blamed_concepts).toEqual([]);
  });

  it("describes a number-line placement using the item's own scale, and reports no blame when the graph has none for that concept+signature", async () => {
    const studentId = `stu_${rand()}`;
    const sessionId = `ses_${rand()}`;
    await postEvidence(
      evidenceBundle({
        student_id: studentId,
        session_id: sessionId,
        game_id: "numberline.place.v2",
        observations: [wrongNumberlineObservation()],
      }),
    );

    const res = await fetch(`${baseUrl}/sessions/${studentId}/${sessionId}`);
    const detail = (await res.json()) as SessionDetail;
    const [observation] = detail.observations;
    expect(observation.prompt_label).toBe("Place 1/8 on a number line from 0 to 1");
    expect(observation.student_answer_label).toBe("Placed it at 0.8");
    expect(observation.correct_answer_label).toBe("0.125");
    // F.MAG.UNIT has an explains edge for LANDMARK_ONLY, not WHOLE_NUMBER_BIAS
    // (see src/graph/data/strand-magnitude-fractions.json) -- confirming the
    // route reports an empty blame list rather than inventing one.
    expect(blame(graph, "F.MAG.UNIT", "WHOLE_NUMBER_BIAS")).toEqual([]);
    expect(observation.blamed_concepts).toEqual([]);
  });
});
