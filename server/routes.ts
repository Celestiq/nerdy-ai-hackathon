import { Router } from "express";
import { graph, registry, itemBank, store, anchors, directory, cohortMembers, studentName, dbConfigured } from "./state.js";
import { checkDbConnection, persistBundle } from "./db.js";
import { selectNext } from "../src/engine/engine.js";
import { isCovered } from "../src/engine/candidates.js";
import { blame, type BlameSuspect } from "../src/graph/query.js";
import { buildTutorReport, type CohortMember } from "../src/analytics/index.js";
import { buildObservation } from "../src/sdk/observation.js";
import type { BeliefState, EvidenceBundle, SignatureRecord as ContractSignatureRecord, Observation } from "../src/contracts/schemas.js";
import { EvidenceBundleSchema } from "../src/contracts/schemas.js";
import type { SignatureCode } from "../src/contracts/signatures.js";
import { numberlineItems } from "../src/games/numberline/items.js";
import { classifyPlacement } from "../src/games/numberline/classify.js";
import { fractionbarsItems, partitionItems } from "../src/games/fractionbars/items.js";
import { classifyChoice, classifyPartition } from "../src/games/fractionbars/classify.js";
import { balancescaleItems } from "../src/games/balancescale/items.js";
import { classifyTip } from "../src/games/balancescale/classify.js";
import type { BeliefInternal } from "../src/store/types.js";

export const api = Router();

api.get("/directory", (_req, res) => {
  res.json(directory.map((d) => ({ student_id: d.student_id, name: d.name, cohort_id: d.cohort_id })));
});

// Rotation seed for a student's NEXT session (BACKLOG.md D1). It is keyed on
// that student's own stored bundle count, so it only moves when that child
// actually submits evidence. It used to be one process-global counter bumped
// by every GET /assignment, so any call (another child's Play, the tutor's
// "Why this next" panel, a map load) shifted every child's rotation and no
// peek could be trusted. Now selecting is a pure read: the child map, the
// tutor panel and Play all compute the same assignment until the next
// bundle lands. A reload before submitting re-serves the same session.
export function nextSessionSeed(studentId: string): string {
  return `srv:${studentId}:${store.bundlesFor(studentId).length}`;
}

function peekNext(studentId: string, belief: Map<string, BeliefInternal> = store.belief(studentId)) {
  return selectNext({ studentId, graph, belief, registry, itemBank, anchors, seed: nextSessionSeed(studentId) });
}

api.get("/assignment/:studentId", (req, res) => {
  res.json(peekNext(req.params.studentId));
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
  if (gameId === "balancescale.compare.v1") {
    res.json(balancescaleItems.filter((i) => ids.includes(i.item_id)));
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

  if (gameId === "balancescale.compare.v1") {
    const item = balancescaleItems.find((i) => i.item_id === item_id);
    if (!item) return res.status(404).json({ error: "unknown item" });
    const tap = choice === "balances" ? "balances" : "doesnt_balance";
    const result = classifyTip(item, tap);
    const observation = buildObservation({
      item_id: item.item_id,
      concept_id: item.concept_id,
      difficulty: item.difficulty,
      response: { kind: "choice", value: tap, target: item.correct },
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

// Diffs belief before/after one evidence submission so the child surface
// can show a one-time "you've got it" beat exactly on the session where a
// concept flips to MASTERED -- never on a session that merely confirms
// already-mastered status. This lives here, not in src/store, because
// "MASTERED is reward-worthy" is a pedagogical judgement about status, and
// the store itself stays pedagogy-free (see LearnerStore's own doc
// comment); same reasoning as why blame() is composed in enrichBelief()
// below rather than folded into the store.
function diffNewlyMastered(before: Map<string, BeliefInternal>, after: Map<string, BeliefInternal>): { concept_id: string; label: string }[] {
  const out: { concept_id: string; label: string }[] = [];
  for (const [conceptId, afterBelief] of after) {
    if (afterBelief.status !== "MASTERED") continue;
    if (before.get(conceptId)?.status === "MASTERED") continue; // already mastered before this submission -- not a new transition
    out.push({ concept_id: conceptId, label: graph.node(conceptId)?.label ?? conceptId });
  }
  return out;
}

// "Pattern cracked" (BACKLOG.md E2, IDEAS B3): a misconception the child had
// already shown on a concept stops showing up in a session where they worked
// that concept and mostly got it right. Same composition-layer reasoning as
// diffNewlyMastered above -- "this recovery is reward-worthy" is a
// pedagogical call, so it lives here, not in src/store.
//
// Signature strength/count never decrease (they're tallies over the whole
// log), so this can't be a before/after diff of belief. Instead, for concept
// C and signature S, the submitted bundle "cracks" S when:
//   - beliefBefore[C] already carries S with count >= PATTERN_MIN_PRIOR_COUNT
//     (a real, repeated pattern -- not a one-off slip), and
//   - the bundle has >= PATTERN_MIN_SESSION_OBS observations on C, none of
//     them signature S, and more than half of them correct, and
//   - no earlier bundle since S was last seen on C already cracked it. This
//     keeps the beat one-shot: a child isn't told they figured out the same
//     tricky thing after every clean session. If S shows up again later and
//     is then cleared again, that is a new crack.
// A duplicate re-send (already in the log) never cracks anything.
//
// The returned `code` is for tests and server-side callers only. The HTTP
// response strips it: the child surface is never told which misconception
// it was, only which concept (and names that with its own kid label).
export const PATTERN_MIN_PRIOR_COUNT = 2;
export const PATTERN_MIN_SESSION_OBS = 2;

function cracksOn(observations: Observation[], conceptId: string, code: string): boolean {
  const onConcept = observations.filter((o) => o.concept_id === conceptId);
  if (onConcept.length < PATTERN_MIN_SESSION_OBS) return false;
  if (onConcept.some((o) => o.signature === code)) return false;
  const correct = onConcept.filter((o) => o.verdict === "correct").length;
  return correct * 2 > onConcept.length;
}

export function diffPatternsCracked(
  beliefBefore: Map<string, BeliefInternal>,
  priorBundles: readonly EvidenceBundle[],
  bundle: EvidenceBundle,
): { concept_id: string; code: string }[] {
  const out: { concept_id: string; code: string }[] = [];
  const conceptIds = [...new Set(bundle.observations.map((o) => o.concept_id))];
  for (const conceptId of conceptIds) {
    const before = beliefBefore.get(conceptId);
    if (!before) continue; // first-ever evidence on this concept: nothing to crack
    for (const sig of before.signatures) {
      if (sig.code === "UNCLASSIFIED" || sig.count < PATTERN_MIN_PRIOR_COUNT) continue;
      if (!cracksOn(bundle.observations, conceptId, sig.code)) continue;
      let lastSeen = -1;
      priorBundles.forEach((b, i) => {
        if (b.observations.some((o) => o.concept_id === conceptId && o.signature === sig.code)) lastSeen = i;
      });
      const alreadyCracked = priorBundles.slice(lastSeen + 1).some((b) => cracksOn(b.observations, conceptId, sig.code));
      if (alreadyCracked) continue;
      out.push({ concept_id: conceptId, code: sig.code });
    }
  }
  return out;
}

api.post("/evidence", async (req, res) => {
  const parsed = EvidenceBundleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ accepted: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    return;
  }
  // Belief is a pure projection over the append-only log (see
  // src/store/store.ts), so "before" is just calling belief() prior to the
  // log append -- no snapshot machinery needed.
  const beliefBefore = store.belief(parsed.data.student_id);
  const priorBundles = store.bundlesFor(parsed.data.student_id);
  const result = store.ingest(parsed.data);
  const beliefAfter = store.belief(parsed.data.student_id);
  // One entry per concept, concept_id only: the signature code never leaves
  // the server on this response (see diffPatternsCracked).
  const patternsCracked =
    result.accepted && !result.duplicate
      ? [...new Set(diffPatternsCracked(beliefBefore, priorBundles, parsed.data).map((p) => p.concept_id))].map((concept_id) => ({ concept_id }))
      : [];

  // Write-through to the durable store (see server/db.ts). The in-memory
  // store above is already the source of truth for this running process --
  // this only decides whether the evidence survives a restart/redeploy. A
  // transient DB error here is logged, not surfaced as a failed submission:
  // losing durability on one bundle beats blocking a child mid-assessment
  // over a database blip.
  let dbPersisted: boolean | undefined;
  if (dbConfigured && result.accepted) {
    try {
      await persistBundle(parsed.data);
      dbPersisted = true;
    } catch (err) {
      dbPersisted = false;
      console.error("persistBundle failed (evidence kept in memory only for this process):", err);
    }
  }

  res.json({ ...result, ...(dbPersisted !== undefined ? { dbPersisted } : {}), newlyMastered: diffNewlyMastered(beliefBefore, beliefAfter), patternsCracked });
});

// A concept the student has already MASTERED can't be the live root cause
// of a current miss -- surfacing it as a blamed suspect would send the
// tutor to remediate something already learned (see BACKLOG.md's F.EQV/
// F.MAG.NONUNIT contradiction: F.MAG.NONUNIT>=0.85 MASTERED is F.EQV's own
// hard prerequisite gate, so the one student who can reach a F.EQV game has
// necessarily already mastered the only concept LANDMARK_ONLY blames it on).
// Filtering here, against the belief map both call sites already have in
// scope, keeps blame() itself concept/student-agnostic (src/graph/query.ts
// has no belief data to filter with, and shouldn't grow any). An empty
// result after filtering is left as-is -- honest "no confident suspect
// currently identified" beats inventing a replacement suspect.
function excludeMasteredSuspects(suspects: BlameSuspect[], belief: Map<string, BeliefInternal>): BlameSuspect[] {
  return suspects.filter((s) => belief.get(s.concept_id)?.status !== "MASTERED");
}

function enrichBelief(studentId: string): BeliefState[] {
  const belief = store.belief(studentId);
  const out: BeliefState[] = [];
  for (const b of belief.values()) {
    const signatures: ContractSignatureRecord[] = b.signatures.map((s) => ({
      ...s,
      code: s.code as SignatureCode,
      blames: excludeMasteredSuspects(blame(graph, b.concept_id, s.code), belief).map((suspect) => suspect.concept_id),
    }));
    out.push({ ...b, signatures });
  }
  return out;
}

api.get("/belief/:studentId", (req, res) => {
  res.json(enrichBelief(req.params.studentId));
});

// -------------------- child star map (BACKLOG.md "Star Path") --------------------
// The child surface's progression home. Everything a child's browser needs
// to draw the map, and nothing more: authored concepts only, a coarse
// visual tier per concept (never p_mastery/p_decayed/confidence, counts or
// ranks), the prerequisite edges between them, and exactly one `next`
// star. The judgement of "which tier" and "which star glows" lives here so
// the child client never sees a probability and never works anything out.
//
// `next` is the concept the child's next Play session leads with: the top
// concept of the same selectNext() call GET /assignment makes (same
// per-student seed, see nextSessionSeed), as long as that concept also
// passes the status-based eligibility rule below. When it doesn't (the
// engine found nothing, or its top concept fails the status guard, e.g. a
// prerequisite over the p threshold but still EMERGING), `next` falls back
// to the best eligible concept by the preference rule, and only then may
// Play lead with something else.

export type StarTier = "seed" | "glow" | "bloom" | "fading";

export interface ChildMapConcept {
  concept_id: string;
  strand: string;
  tier: StarTier;
  next: boolean;
}

export interface ChildMapStrand {
  strand: string;
  /** Authored concepts in this strand, prerequisite-first. Empty when the strand has no authored content yet. */
  concept_ids: string[];
  /** The strand also holds concepts no game can serve yet (rendered as one soft "more coming" hint, never as dead seeds). */
  hasComingLater: boolean;
}

export interface ChildMap {
  student_id: string;
  strands: ChildMapStrand[];
  concepts: ChildMapConcept[];
  edges: { from: string; to: string; strength: "hard" | "supporting" }[];
}

function starTier(belief: BeliefInternal | undefined): StarTier {
  if (!belief || belief.status === "UNTESTED") return "seed";
  if (belief.status === "MASTERED") return "bloom";
  if (belief.status === "DECAYED") return "fading";
  // EMERGING and STUCK share one warm "growing" tier on purpose: STUCK must
  // never read as alarming on the child surface.
  return "glow";
}

// `next` eligibility is decided by belief *status*, not raw p_mastery, so it
// agrees with the mastery gate in src/store/projector.ts (p over threshold
// alone is not mastery -- the recent-evidence floor must also hold).
//   - the concept itself is EMERGING, UNTESTED or DECAYED. STUCK never
//     glows: it is escalated to a person and the engine hard-blocks it, so
//     a glow would promise "ready to grow" and Play would serve something
//     else. MASTERED never glows.
//   - every hard prerequisite is MASTERED or DECAYED (a prerequisite still
//     EMERGING, even over the p threshold, blocks its successor).
//   - authored, and some registered game can actually serve it.
// Among eligible concepts the engine's top concept wins (see above). Fallback
// preference, only when it isn't eligible: keep growing started work (EMERGING), then refresh a fading
// star (DECAYED), then a fresh seed (UNTESTED); ties by shallower depth,
// then graph order. If nothing qualifies there is no `next` at all.
// frontier() in src/graph/query.ts is deliberately not used here: it is
// p_mastery-based and the engine depends on it as-is.
const NEXT_PREFERENCE: Partial<Record<BeliefInternal["status"], number>> = { EMERGING: 0, DECAYED: 1, UNTESTED: 2 };
const PREREQ_SATISFIED: ReadonlySet<BeliefInternal["status"]> = new Set(["MASTERED", "DECAYED"]);

export function buildChildMap(studentId: string): ChildMap {
  const belief = store.belief(studentId);
  const authoredNodes = [...graph.nodes.values()].filter((n) => n.status === "authored");
  const authoredIds = new Set(authoredNodes.map((n) => n.concept_id));
  const graphOrder = new Map([...graph.nodes.keys()].map((id, i) => [id, i]));

  const edges = graph.data.requires
    .filter((e) => authoredIds.has(e.from) && authoredIds.has(e.to))
    .map((e) => ({ from: e.from, to: e.to, strength: e.strength }));

  // Prerequisite depth within the concept's own strand (longest chain of
  // same-strand requires edges), so each strand reads as a short trail that
  // starts at its foundation. Cross-strand edges are still returned above.
  const depthMemo = new Map<string, number>();
  const depth = (id: string, seen = new Set<string>()): number => {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const strand = graph.node(id)?.strand;
    const prereqs = edges.filter((e) => e.from === id && graph.node(e.to)?.strand === strand);
    const d = prereqs.length === 0 ? 0 : 1 + Math.max(...prereqs.map((e) => depth(e.to, seen)));
    depthMemo.set(id, d);
    return d;
  };

  const strandOrder: string[] = [];
  for (const node of graph.nodes.values()) if (!strandOrder.includes(node.strand)) strandOrder.push(node.strand);

  const strands: ChildMapStrand[] = strandOrder.map((strand) => {
    const inStrand = [...graph.nodes.values()].filter((n) => n.strand === strand);
    const concept_ids = inStrand
      .filter((n) => n.status === "authored")
      .map((n) => n.concept_id)
      .sort((a, b) => depth(a) - depth(b) || graphOrder.get(a)! - graphOrder.get(b)!);
    return { strand, concept_ids, hasComingLater: inStrand.some((n) => n.status !== "authored") };
  });

  const statusOf = (id: string): BeliefInternal["status"] => belief.get(id)?.status ?? "UNTESTED";
  const eligible = authoredNodes
    .filter((n) => NEXT_PREFERENCE[statusOf(n.concept_id)] !== undefined)
    .filter((n) =>
      graph.data.requires
        .filter((e) => e.from === n.concept_id && e.strength === "hard")
        .every((e) => PREREQ_SATISFIED.has(statusOf(e.to))),
    )
    .filter((n) => isCovered(graph, registry, itemBank, n.concept_id))
    .sort(
      (a, b) =>
        NEXT_PREFERENCE[statusOf(a.concept_id)]! - NEXT_PREFERENCE[statusOf(b.concept_id)]! ||
        depth(a.concept_id) - depth(b.concept_id) ||
        graphOrder.get(a.concept_id)! - graphOrder.get(b.concept_id)!,
    );
  // Prefer the engine's own top concept for the next session (a pure read,
  // nothing is incremented), guarded by the status rule above.
  const engineTop = peekNext(studentId, belief).assignment?.concepts[0];
  const nextId = eligible.find((n) => n.concept_id === engineTop)?.concept_id ?? eligible[0]?.concept_id ?? null;

  const concepts: ChildMapConcept[] = strands.flatMap((s) =>
    s.concept_ids.map((id) => ({ concept_id: id, strand: s.strand, tier: starTier(belief.get(id)), next: id === nextId })),
  );

  return { student_id: studentId, strands, concepts, edges };
}

api.get("/child/map/:studentId", (req, res) => {
  res.json(buildChildMap(req.params.studentId));
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
    "Treats the line as if equal ratios (not equal amounts) get equal space, so small numbers are placed too far to the right and larger numbers get squeezed together near the high end instead of spread out to their true positions.",
  LONGER_IS_LARGER:
    "Judges a decimal's size by how many digits it has (e.g. thinks 0.125 is bigger than 0.7 because \"125\" looks bigger than \"7\").",
  LANDMARK_ONLY:
    "Judges by a surface cue -- how close a mark looks to a landmark (0, the middle, the end), or how different two numbers look -- instead of working out the actual magnitude each represents.",
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

  const balanceItem = balancescaleItems.find((i) => i.item_id === obs.item_id);
  if (balanceItem) {
    const label = (w: { numerator: number; denominator: number }) => `${w.numerator}/${w.denominator}`;
    const verdict = (v: string) => (v === "balances" ? "Balances" : "Doesn't balance");
    return {
      prompt_label: `Does ${label(balanceItem.left)} balance ${label(balanceItem.right)}?`,
      student_answer_label: verdict(String(obs.response.value)),
      correct_answer_label: verdict(balanceItem.correct),
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

  const belief = store.belief(req.params.studentId);
  const observations = bundle.observations.map((o) => {
    const { prompt_label, student_answer_label, correct_answer_label } = describeResponse(bundle.game_id, o);
    const suspects =
      o.verdict === "incorrect" && o.signature !== "UNCLASSIFIED"
        ? excludeMasteredSuspects(blame(graph, o.concept_id, o.signature), belief)
        : [];
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

api.get("/health", async (_req, res) => {
  const db = dbConfigured ? ((await checkDbConnection()) ? "connected" : "error") : "disabled";
  res.json({ ok: db !== "error", graphVersion: graph.version, games: registry.all().map((m) => m.game_id), db });
});
