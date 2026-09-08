import type { ConceptGraphData } from "./types.js";
import { isSignatureCode } from "../contracts/signatures.js";
import { isConceptId } from "../contracts/concepts.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Structural validation, per roadmap.html C3 "Structural" tests:
 *  - requires is acyclic
 *  - every node id is well-formed and unique
 *  - every edge references a node that exists
 *  - every explains.signature exists in the registry
 *  - grade bands don't contradict edge direction (a hard prerequisite
 *    shouldn't be scheduled for a strictly later grade band than its
 *    dependent)
 */
export function validateGraph(data: ConceptGraphData): ValidationResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  const byId = new Map(data.nodes.map((n) => [n.concept_id, n]));

  for (const node of data.nodes) {
    if (!isConceptId(node.concept_id)) {
      errors.push(`node ${node.concept_id}: not a legal concept id`);
    }
    if (seen.has(node.concept_id)) {
      errors.push(`node ${node.concept_id}: duplicate concept id`);
    }
    seen.add(node.concept_id);
    if (node.grade_band[0] > node.grade_band[1]) {
      errors.push(`node ${node.concept_id}: grade_band is inverted`);
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of data.requires) {
    if (!byId.has(edge.from)) errors.push(`requires edge references unknown node "${edge.from}"`);
    if (!byId.has(edge.to)) errors.push(`requires edge references unknown node "${edge.to}"`);
    if (edge.from === edge.to) errors.push(`requires edge is self-referential at "${edge.from}"`);

    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (from && to && edge.strength === "hard" && from.grade_band[0] < to.grade_band[0]) {
      errors.push(
        `requires edge ${edge.from} -> ${edge.to}: hard prerequisite is scheduled for a later grade band than the concept that needs it`,
      );
    }

    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from)!.push(edge.to);
  }

  // acyclicity: DFS with recursion stack
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>(data.nodes.map((n) => [n.concept_id, WHITE]));
  const cyclic: string[] = [];
  function dfs(id: string) {
    color.set(id, GRAY);
    for (const next of adjacency.get(id) ?? []) {
      const c = color.get(next);
      if (c === GRAY) cyclic.push(`${id} -> ${next}`);
      else if (c === WHITE) dfs(next);
    }
    color.set(id, BLACK);
  }
  for (const node of data.nodes) {
    if (color.get(node.concept_id) === WHITE) dfs(node.concept_id);
  }
  for (const c of cyclic) errors.push(`requires graph has a cycle through ${c}`);

  for (const edge of data.explains) {
    if (!byId.has(edge.at)) errors.push(`explains edge references unknown node "${edge.at}" (at)`);
    if (!byId.has(edge.blames)) errors.push(`explains edge references unknown node "${edge.blames}" (blames)`);
    if (!isSignatureCode(edge.signature)) {
      errors.push(`explains edge at "${edge.at}" references unknown signature "${edge.signature}"`);
    }
    if (!edge.provenance || edge.provenance.trim().length === 0) {
      errors.push(`explains edge at "${edge.at}" -> "${edge.blames}" is missing provenance`);
    }
    if (edge.weight < 0 || edge.weight > 1) {
      errors.push(`explains edge at "${edge.at}" -> "${edge.blames}" has out-of-range weight`);
    }
  }

  return { ok: errors.length === 0, errors };
}
