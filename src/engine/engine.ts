import type { ConceptGraph } from "../graph/loader.js";
import type { GameRegistry, ItemBankRegistry, ItemBankEntry } from "../registry/index.js";
import type { BeliefInternal } from "../store/types.js";
import type { Assignment, DecisionLogEntrySchema } from "../contracts/schemas.js";
import { AssignmentSchema } from "../contracts/schemas.js";
import { candidateConcepts, isColdStart, isCovered, rootConcepts } from "./candidates.js";
import { scoreCandidates } from "./scoring.js";
import { applyHardConstraints, stuckEscalations } from "./constraints.js";
import { assembleAssignment } from "./assemble.js";
import { hash } from "./hash.js";
import type { z } from "zod";

type DecisionLogEntry = z.infer<typeof DecisionLogEntrySchema>;

const ANCHOR_REASON = "anchor (fixed cohort item)";

export interface SelectionInput {
  studentId: string;
  graph: ConceptGraph;
  belief: Map<string, BeliefInternal>;
  registry: GameRegistry;
  itemBank: ItemBankRegistry;
  anchors: Map<string, ItemBankEntry[]>;
  cohortNeeds?: Set<string>;
  seed: string;
  now?: Date;
}

export interface SelectionOutput {
  assignment: Assignment | undefined;
  reason?: string;
  escalations: string[];
  decisionLog: DecisionLogEntry[];
}

/**
 * Given a child, produce the next five minutes. Deterministic, auditable,
 * no model in the path. See architecture.html #engine.
 */
export function selectNext(input: SelectionInput): SelectionOutput {
  const { studentId, graph, belief, registry, itemBank, anchors, seed } = input;
  const now = input.now ?? new Date();
  const cohortNeeds = input.cohortNeeds ?? new Set<string>();

  const coldStart = isColdStart(belief);
  // A concept nothing can assess is never a real candidate -- score it out
  // up front, every round, not just at cold start. Without this, an
  // uncovered concept can out-score a covered one on uncertainty alone
  // (nothing has ever measured it) and permanently stall selection with a
  // coverage-gap result instead of serving the concept that's actually
  // playable. See roadmap.html C5 "coverage report".
  let candidates = candidateConcepts(graph, belief).filter((c) => isCovered(graph, registry, itemBank, c));
  if (coldStart) {
    const roots = new Set(rootConcepts(graph));
    const coveredRoots = candidates.filter((c) => roots.has(c));
    // Prefer roots a registered game can actually assess. If every root is
    // presently a coverage gap, fall back to any covered frontier concept
    // rather than dead-ending the child's very first session.
    if (coveredRoots.length > 0) candidates = coveredRoots;
  }

  const decisionLog: DecisionLogEntry[] = [];
  const escalations = stuckEscalations(belief);

  if (candidates.length === 0) {
    return {
      assignment: undefined,
      reason: coldStart
        ? "cold start produced no root concepts -- graph is empty or misconfigured"
        : "no candidate concepts: everything is either mastered, stuck, or unreachable",
      escalations,
      decisionLog,
    };
  }

  const scored = scoreCandidates(graph, belief, candidates, cohortNeeds);
  const { allowed, blocked, relaxed } = applyHardConstraints(graph, belief, scored, seed);

  for (const b of blocked) decisionLog.push({ concept_id: b.concept_id, included: false, score: b.score, reason: b.reason });

  if (allowed.length === 0) {
    for (const s of scored) {
      if (!decisionLog.find((d) => d.concept_id === s.concept_id)) {
        decisionLog.push({ concept_id: s.concept_id, included: false, score: s.score, reason: "excluded by hard constraints" });
      }
    }
    return { assignment: undefined, reason: "every candidate was blocked by a hard constraint", escalations, decisionLog };
  }

  // Never lead with an already-MASTERED concept while any chosen concept is
  // unmastered: concepts[0] picks the game, opens the session and gets the
  // largest share, so a hysteresis-held MASTERED concept rides in the tail
  // (stable reorder; score order otherwise kept).
  const isMastered = (id: string) => belief.get(id)?.status === "MASTERED";
  const chosenConcepts = [...allowed.filter((a) => !isMastered(a.concept_id)), ...allowed.filter((a) => isMastered(a.concept_id))].map(
    (a) => a.concept_id,
  );
  const assembled = assembleAssignment(graph, registry, itemBank, chosenConcepts, anchors, seed, relaxed, new Set(escalations));

  if (!assembled) {
    for (const a of allowed) {
      const reason =
        a.concept_id === relaxed
          ? "no registered game covers this concept (coverage gap) -- also had its wheel-spin block relaxed: no other candidate available"
          : "no registered game covers this concept (coverage gap)";
      decisionLog.push({ concept_id: a.concept_id, included: false, score: a.score, reason });
    }
    return { assignment: undefined, reason: "coverage gap: no registered game can assess the chosen concept(s)", escalations, decisionLog };
  }

  for (const a of allowed) {
    const included = assembled.concepts.includes(a.concept_id);
    const selectedReason =
      a.concept_id === relaxed
        ? "wheel-spin relaxed: no other candidate available"
        : coldStart
          ? "cold start: root concept, first session"
          : "selected: top of frontier/uncertainty/retrieval/blame score";
    decisionLog.push({
      concept_id: a.concept_id,
      included,
      score: a.score,
      reason: included ? selectedReason : "matched game did not cover this concept",
    });
  }

  // Anchor items are fixed cohort items served regardless of routing (see
  // assemble.ts), so every anchor concept actually served gets a true
  // decision_log line -- one entry per concept, so the tutor trace never
  // lists a served concept only under "not chosen".
  for (const conceptId of assembled.anchorConcepts) {
    const existing = decisionLog.find((d) => d.concept_id === conceptId);
    if (!existing) {
      decisionLog.push({ concept_id: conceptId, included: true, score: 0, reason: ANCHOR_REASON });
    } else if (!existing.included) {
      existing.included = true;
      existing.reason = `${ANCHOR_REASON}; not chosen adaptively -- ${existing.reason}`;
    }
  }
  for (const skipped of assembled.skippedAnchors) {
    const score = scored.find((s) => s.concept_id === skipped.concept_id)?.score ?? 0;
    decisionLog.push({ concept_id: skipped.concept_id, included: false, score, reason: "anchor skipped: stuck" });
  }

  const assignment: Assignment = {
    assignment_id: `asg_${hash(seed)}`,
    student_id: studentId,
    game_id: assembled.game_id,
    concepts: assembled.concepts,
    item_specs: assembled.item_specs,
    time_budget_s: assembled.time_budget_s,
    created_at: now.toISOString(),
    seed,
    decision_log: decisionLog,
  };

  const parsed = AssignmentSchema.safeParse(assignment);
  if (!parsed.success) {
    return {
      assignment: undefined,
      reason: `assembled assignment failed its own contract: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      escalations,
      decisionLog,
    };
  }

  return { assignment: parsed.data, escalations, decisionLog };
}
