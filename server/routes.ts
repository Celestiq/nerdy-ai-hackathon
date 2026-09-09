import { Router } from "express";
import { graph, registry, itemBank, store, anchors, directory, cohortMembers, studentName } from "./state.js";
import { selectNext } from "../src/engine/engine.js";
import { blame } from "../src/graph/query.js";
import { buildTutorReport, type CohortMember } from "../src/analytics/index.js";
import { buildObservation } from "../src/sdk/observation.js";
import type { BeliefState, SignatureRecord as ContractSignatureRecord, Observation } from "../src/contracts/schemas.js";
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

// Plain-English explanations of each signature, for the tutor's per-test
// review screen. Kept here (server, not store/analytics) because this is
// display prose over evidence the tutor already has, not a new pedagogical
// judgement -- the same "fixed slot, not a model" rule buildOpeningMove
// follows in src/analytics/analytics.ts.
const SIGNATURE_MEANINGS: Record<SignatureCode, string> = {
  WHOLE_NUMBER_BIAS:
    "Reasons about the fraction like a whole number -- treating a bigger numerator or denominator as simply \"bigger\" rather than working out the value it represents.",
  LOG_COMPRESSION:
    "Treats the line as if equal ratios (not equal amounts) get equal space, so larger numbers get squeezed too close to the low end instead of spread out to their true position.",
  LONGER_IS_LARGER:
    "Judges a decimal's size by how many digits it has (e.g. thinks 0.125 is bigger than 0.7 because \"125\" looks bigger than \"7\").",
  LANDMARK_ONLY: "Anchors the placement to the nearest landmark (0, the middle, the end) instead of reasoning about the exact magnitude.",
  RANGE_COMPRESSION: "Squeezes placements toward the middle of the range instead of using the full scale.",
  DENOMINATOR_BIAS: "Compares fractions by denominator alone (bigger denominator = bigger fraction), ignoring the numerator.",
  UNCLASSIFIED: "No specific misconception pattern was detected in this response.",
};

const PARTITION_WORDS: Record<number, string> = { 2: "halves", 3: "thirds", 4: "fourths", 5: "fifths", 6: "sixths" };

/** Turns one raw Observation back into the question/answer a tutor can read, by looking the item back up in the same item bank the game read it from. */
function describeResponse(gameId: string, obs: Observation): { prompt_label: string; student_answer_label: string; correct_answer_label: string } {
  if (gameId === "numberline.place.v2") {
    const item = numberlineItems.find((i) => i.item_id === obs.item_id);
    const [lo, hi] = item?.scale ?? [0, 1];
    const toUnits = (v: number) => Math.round((lo + v * (hi - lo)) * 1000) / 1000;
    const value = Number(obs.response.value);
    const target = obs.response.target != null ? Number(obs.response.target) : item?.target ?? 0;
    return {
      prompt_label: `Place ${item?.prompt ?? obs.item_id} on a number line from ${lo} to ${hi}`,
      student_answer_label: `Placed it at ${toUnits(value)}`,
      correct_answer_label: `${toUnits(target)}`,
    };
  }

  const compareItem = fractionbarsItems.find((i) => i.item_id === obs.item_id);
  if (compareItem) {
    const label = (side: "a" | "b") => `${compareItem[side].numerator}/${compareItem[side].denominator}`;
    const choice = obs.response.value === "a" ? "a" : "b";
    return {
      prompt_label: `Which is bigger: ${label("a")} or ${label("b")}?`,
      student_answer_label: `Chose ${label(choice)}`,
      correct_answer_label: label(compareItem.correct),
    };
  }

  const partitionItem = partitionItems.find((i) => i.item_id === obs.item_id);
  if (partitionItem) {
    const word = PARTITION_WORDS[partitionItem.parts] ?? `${partitionItem.parts}ths`;
    const choice = obs.response.value === "a" ? "a" : "b";
    return {
      prompt_label: `Which shape shows equal ${word}?`,
      student_answer_label: choice === "a" ? "Chose shape A" : "Chose shape B",
      correct_answer_label: partitionItem.correct === "a" ? "Shape A" : "Shape B",
    };
  }

  return {
    prompt_label: obs.item_id,
    student_answer_label: String(obs.response.value),
    correct_answer_label: obs.response.target != null ? String(obs.response.target) : "",
  };
}

// One row per past test session (evidence bundle), newest first -- the
// tutor's "all past tests for this child" list.
api.get("/sessions/:studentId", (req, res) => {
  const bundles = store.bundlesFor(req.params.studentId);
  const summaries = [...bundles]
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .map((b) => ({
      session_id: b.session_id,
      game_id: b.game_id,
      started_at: b.started_at,
      ended_at: b.ended_at,
      completed: b.engagement.completed,
      item_count: b.observations.length,
      correct_count: b.observations.filter((o) => o.verdict === "correct").length,
      concept_ids: [...new Set(b.observations.map((o) => o.concept_id))],
    }));
  res.json(summaries);
});

// Full question-by-question detail for one past test: what was asked, what
// the child answered, what was correct, and what the response reveals
// (concept + misconception signature, traced back to a suspected root cause
// via the same blame() the cohort report uses).
api.get("/sessions/:studentId/:sessionId", (req, res) => {
  const bundle = store.bundlesFor(req.params.studentId).find((b) => b.session_id === req.params.sessionId);
  if (!bundle) return res.status(404).json({ error: "unknown session" });

  const observations = bundle.observations.map((o) => {
    const { prompt_label, student_answer_label, correct_answer_label } = describeResponse(bundle.game_id, o);
    const suspects = o.verdict === "incorrect" && o.signature !== "UNCLASSIFIED" ? blame(graph, o.concept_id, o.signature) : [];
    return {
      item_id: o.item_id,
      concept_id: o.concept_id,
      concept_label: graph.node(o.concept_id)?.label ?? o.concept_id,
      difficulty: o.difficulty,
      verdict: o.verdict,
      prompt_label,
      student_answer_label,
      correct_answer_label,
      signature: o.signature,
      signature_confidence: o.signature_confidence,
      signature_meaning: o.signature === "UNCLASSIFIED" ? null : SIGNATURE_MEANINGS[o.signature],
      blamed_concepts: suspects.map((s) => ({ concept_id: s.concept_id, label: graph.node(s.concept_id)?.label ?? s.concept_id })),
      latency_ms: o.latency_ms,
      attempts: o.attempts,
      flags: o.flags,
    };
  });

  res.json({
    session_id: bundle.session_id,
    student_id: bundle.student_id,
    game_id: bundle.game_id,
    started_at: bundle.started_at,
    ended_at: bundle.ended_at,
    completed: bundle.engagement.completed,
    observations,
  });
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
