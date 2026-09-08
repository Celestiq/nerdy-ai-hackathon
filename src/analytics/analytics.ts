import type { ConceptGraph } from "../graph/loader.js";
import { blame } from "../graph/query.js";
import type { BeliefInternal } from "../store/types.js";
import { WHEEL_SPIN_LIMIT } from "../store/types.js";

const CONFIDENCE_THRESHOLD = 0.35;

export interface StuckEntry {
  student_id: string;
  concept_id: string;
  attempts_without_mastery: number;
}

export interface MisconceptionCluster {
  signature: string;
  concept_id: string;
  student_ids: string[];
  root_cause: string | null;
  root_cause_provenance: string | null;
}

export interface RetentionAlert {
  student_id: string;
  concept_id: string;
  p_mastery: number;
  p_decayed: number;
}

export interface ConceptCoverageRow {
  concept_id: string;
  measured_n: number;
  weak_n: number; // measured, confident, below threshold
  mastered_n: number;
  unmeasured_n: number; // strictly separate from weak -- see architecture.html #screens
}

export interface OpeningMove {
  text: string;
  based_on: string; // cluster or alert this move was templated from
}

export interface TutorReport {
  cohort_id: string;
  generated_at: string;
  cohort_size: number;
  stuck: StuckEntry[];
  clusters: MisconceptionCluster[];
  retention: RetentionAlert[];
  coverage: ConceptCoverageRow[];
  opening_move: OpeningMove | null;
}

export interface CohortMember {
  student_id: string;
  name: string;
  belief: Map<string, BeliefInternal>;
}

/**
 * Turns per-child belief state into cohort-level findings. See
 * architecture.html #tutor and roadmap.html C10. The "unmeasured must
 * never render as weak" guard runs here, not in the UI: an unmeasured
 * concept is never counted toward weak_n, and low-confidence findings are
 * withheld outright rather than shown faintly.
 */
export function buildTutorReport(graph: ConceptGraph, cohortId: string, members: CohortMember[], now: Date = new Date()): TutorReport {
  const stuck: StuckEntry[] = [];
  const retention: RetentionAlert[] = [];
  const clusterMap = new Map<string, MisconceptionCluster>();

  for (const member of members) {
    for (const b of member.belief.values()) {
      if (b.attempts_without_mastery >= WHEEL_SPIN_LIMIT) {
        stuck.push({ student_id: member.student_id, concept_id: b.concept_id, attempts_without_mastery: b.attempts_without_mastery });
      }
      if (b.status === "DECAYED" && b.confidence >= CONFIDENCE_THRESHOLD) {
        retention.push({ student_id: member.student_id, concept_id: b.concept_id, p_mastery: b.p_mastery, p_decayed: b.p_decayed });
      }
      if (b.confidence < CONFIDENCE_THRESHOLD) continue; // withheld, not shown faintly
      for (const sig of b.signatures) {
        if (sig.count === 0) continue;
        const key = `${b.concept_id}::${sig.code}`;
        const cluster = clusterMap.get(key) ?? {
          signature: sig.code,
          concept_id: b.concept_id,
          student_ids: [],
          root_cause: null,
          root_cause_provenance: null,
        };
        if (!cluster.student_ids.includes(member.student_id)) cluster.student_ids.push(member.student_id);
        if (!cluster.root_cause) {
          const suspects = blame(graph, b.concept_id, sig.code);
          if (suspects[0]) {
            cluster.root_cause = suspects[0].concept_id;
            cluster.root_cause_provenance = suspects[0].provenance;
          }
        }
        clusterMap.set(key, cluster);
      }
    }
  }

  const clusters = [...clusterMap.values()]
    .filter((c) => c.student_ids.length >= 2) // a cluster is a shared pattern, not one child's single miss
    .sort((a, b) => b.student_ids.length - a.student_ids.length);

  const coverage = buildCoverage(graph, members);
  const opening_move = buildOpeningMove(clusters, retention);

  return {
    cohort_id: cohortId,
    generated_at: now.toISOString(),
    cohort_size: members.length,
    stuck,
    clusters,
    retention,
    coverage,
    opening_move,
  };
}

function buildCoverage(graph: ConceptGraph, members: CohortMember[]): ConceptCoverageRow[] {
  const rows: ConceptCoverageRow[] = [];
  for (const node of graph.nodes.values()) {
    let measured_n = 0,
      weak_n = 0,
      mastered_n = 0,
      unmeasured_n = 0;
    for (const member of members) {
      const b = member.belief.get(node.concept_id);
      if (!b || b.observations_n === 0) {
        unmeasured_n += 1;
        continue;
      }
      measured_n += 1;
      if (b.p_mastery >= node.mastery_threshold) mastered_n += 1;
      else if (b.confidence >= CONFIDENCE_THRESHOLD) weak_n += 1; // below threshold AND confident enough to say so
    }
    rows.push({ concept_id: node.concept_id, measured_n, weak_n, mastered_n, unmeasured_n });
  }
  return rows;
}

function buildOpeningMove(clusters: MisconceptionCluster[], retention: RetentionAlert[]): OpeningMove | null {
  // Templated prose into a fixed slot -- see architecture.html #engine
  // "Where a language model is allowed": tutor-facing prose is fine here,
  // but the slot and the underlying finding are fixed by this function,
  // not by a model.
  if (clusters.length > 0) {
    const c = clusters[0];
    const names = c.student_ids.length <= 3 ? c.student_ids.join(", ") : `${c.student_ids.length} children`;
    return {
      text: `Put ${names}'s work on ${c.concept_id} side by side and ask the class to explain the difference -- the shared pattern is ${c.signature.toLowerCase().replace(/_/g, " ")}, tracing back to ${c.root_cause ?? "an earlier concept"}.`,
      based_on: `cluster:${c.concept_id}:${c.signature}`,
    };
  }
  if (retention.length > 0) {
    const r = retention[0];
    return {
      text: `Open with a quick retrieval check on ${r.concept_id} -- it was mastered before but looks to have faded for at least one child.`,
      based_on: `retention:${r.concept_id}`,
    };
  }
  return null;
}
