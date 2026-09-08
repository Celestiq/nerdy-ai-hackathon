import { Router } from "express";
import { graph, registry, itemBank, store, anchors, directory, cohortMembers, studentName } from "./state.js";
import { selectNext } from "../src/engine/engine.js";
import { blame } from "../src/graph/query.js";
import { buildTutorReport, type CohortMember } from "../src/analytics/index.js";
import { buildObservation } from "../src/sdk/observation.js";
import type { BeliefState, SignatureRecord as ContractSignatureRecord } from "../src/contracts/schemas.js";
import { EvidenceBundleSchema } from "../src/contracts/schemas.js";
import type { SignatureCode } from "../src/contracts/signatures.js";
import { numberlineItems } from "../src/games/numberline/items.js";
import { classifyPlacement } from "../src/games/numberline/classify.js";
import { fractionbarsItems, partitionItems } from "../src/games/fractionbars/items.js";
import { classifyChoice, classifyPartition } from "../src/games/fractionbars/classify.js";

export const api = Router();

let sessionCounter = 0;

api.get("/directory", (_req, res) => {
  res.json(directory.map((d) => ({ student_id: d.student_id, name: d.name, cohort_id: d.cohort_id })));
});

api.get("/assignment/:studentId", (req, res) => {
  const studentId = req.params.studentId;
  const belief = store.belief(studentId);
  sessionCounter += 1;
  const result = selectNext({
    studentId,
    graph,
    belief,
    registry,
    itemBank,
    anchors,
    seed: `srv:${studentId}:${sessionCounter}`,
  });
  res.json(result);
});

// Item content lives with the game, same as it would in a client bundle --
// see architecture.html #games: the region map is authored WITH the item.
api.get("/items/:gameId", (req, res) => {
  const { gameId } = req.params;
  const ids = String(req.query.ids ?? "").split(",").filter(Boolean);
  if (gameId === "numberline.place.v2") {
    res.json(numberlineItems.filter((i) => ids.includes(i.item_id)));
    return;
  }
  if (gameId === "fractionbars.compare.v1") {
    res.json([
      ...fractionbarsItems.filter((i) => ids.includes(i.item_id)).map((i) => ({ ...i, kind: "compare" as const })),
      ...partitionItems.filter((i) => ids.includes(i.item_id)).map((i) => ({ ...i, kind: "partition" as const })),
    ]);
    return;
  }
  res.status(404).json({ error: `unknown game_id ${gameId}` });
});

// Runs the exact tested classify.ts logic and hands back a contract-shaped
// Observation. The child client is otherwise dumb: render, capture timing,
// accumulate, submit -- it never decides what the response means.
api.post("/games/:gameId/respond", (req, res) => {
  const { gameId } = req.params;
  const { item_id, value, choice, attempts, startedAtMs, endedAtMs } = req.body ?? {};

  if (gameId === "numberline.place.v2") {
    const item = numberlineItems.find((i) => i.item_id === item_id);
    if (!item) return res.status(404).json({ error: "unknown item" });
    const result = classifyPlacement(item, Number(value));
    const observation = buildObservation({
      item_id: item.item_id,
      concept_id: item.concept_id,
      difficulty: item.difficulty,
      response: { kind: "position", value: Number(value), target: item.target },
      verdict: result.verdict,
      signature: result.signature,
      signature_confidence: result.signature_confidence,
      startedAtMs: Number(startedAtMs),
      endedAtMs: Number(endedAtMs),
      attempts: Number(attempts) || 1,
    });
    return res.json(observation);
  }

  if (gameId === "fractionbars.compare.v1") {
    const compareItem = fractionbarsItems.find((i) => i.item_id === item_id);
    const partitionItem = partitionItems.find((i) => i.item_id === item_id);
    const item = compareItem ?? partitionItem;
    if (!item) return res.status(404).json({ error: "unknown item" });
    const result = compareItem ? classifyChoice(compareItem, choice === "a" ? "a" : "b") : classifyPartition(partitionItem!, choice === "a" ? "a" : "b");
    const observation = buildObservation({
      item_id: item.item_id,
      concept_id: item.concept_id,
      difficulty: item.difficulty,
      response: { kind: "choice", value: choice === "a" ? "a" : "b", target: item.correct },
      verdict: result.verdict,
      signature: result.signature,
      signature_confidence: result.signature_confidence,
      startedAtMs: Number(startedAtMs),
      endedAtMs: Number(endedAtMs),
      attempts: Number(attempts) || 1,
    });
    return res.json(observation);
  }

  res.status(404).json({ error: `unknown game_id ${gameId}` });
});

api.post("/evidence", (req, res) => {
  const parsed = EvidenceBundleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ accepted: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    return;
  }
  const result = store.ingest(parsed.data);
  res.json(result);
});

function enrichBelief(studentId: string): BeliefState[] {
  const belief = store.belief(studentId);
  const out: BeliefState[] = [];
  for (const b of belief.values()) {
    const signatures: ContractSignatureRecord[] = b.signatures.map((s) => ({
      ...s,
      code: s.code as SignatureCode,
      blames: blame(graph, b.concept_id, s.code).map((suspect) => suspect.concept_id),
    }));
    out.push({ ...b, signatures });
  }
  return out;
}

api.get("/belief/:studentId", (req, res) => {
  res.json(enrichBelief(req.params.studentId));
});

api.get("/tutor/report/:cohortId", (req, res) => {
  const cohortId = req.params.cohortId;
  const members = cohortMembers(cohortId);
  const cohortMembersForAnalytics: CohortMember[] = members.map((m) => ({
    student_id: m.student_id,
    name: m.name,
    belief: store.belief(m.student_id),
  }));
  const report = buildTutorReport(graph, cohortId, cohortMembersForAnalytics);
  const named = {
    ...report,
    stuck: report.stuck.map((s) => ({ ...s, name: studentName(s.student_id) })),
    clusters: report.clusters.map((c) => ({ ...c, names: c.student_ids.map(studentName) })),
    retention: report.retention.map((r) => ({ ...r, name: studentName(r.student_id) })),
  };
  res.json(named);
});

api.get("/graph/concepts", (_req, res) => {
  res.json([...graph.nodes.values()]);
});

api.get("/concepts/:conceptId", (req, res) => {
  const node = graph.node(req.params.conceptId);
  if (!node) return res.status(404).json({ error: "unknown concept" });
  res.json(node);
});

api.get("/health", (_req, res) => {
  res.json({ ok: true, graphVersion: graph.version, games: registry.all().map((m) => m.game_id) });
});
