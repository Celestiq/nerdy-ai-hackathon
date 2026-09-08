import type { ConceptGraph } from "./loader.js";
import type { ConceptNode } from "./types.js";
import type { CapabilityManifest } from "../contracts/schemas.js";

/**
 * The graph's read-only query surface: frontier, blame, path, coverage.
 * See architecture.html #graph. No student data ever enters this module --
 * belief is always handed in by the caller as a plain lookup.
 */

export interface BeliefLookup {
  (conceptId: string): { p_mastery: number } | undefined;
}

function prereqMet(graph: ConceptGraph, prereqId: string, belief: BeliefLookup): boolean {
  const prereq = graph.node(prereqId);
  if (!prereq) return false;
  const b = belief(prereqId);
  return (b?.p_mastery ?? 0) >= prereq.mastery_threshold;
}

/** Concepts whose hard prerequisites are met but which aren't yet mastered. */
export function frontier(graph: ConceptGraph, belief: BeliefLookup): string[] {
  const out: string[] = [];
  for (const node of graph.nodes.values()) {
    const ownMastery = belief(node.concept_id)?.p_mastery ?? 0;
    if (ownMastery >= node.mastery_threshold) continue; // already mastered, not on the frontier

    const hardReqs = graph.data.requires.filter((e) => e.from === node.concept_id && e.strength === "hard");
    const allHardMet = hardReqs.every((e) => prereqMet(graph, e.to, belief));
    if (allHardMet) out.push(node.concept_id);
  }
  return out;
}

export interface BlameSuspect {
  concept_id: string;
  weight: number;
  provenance: string;
}

/** Ranked prerequisite suspects for a specific observed error. */
export function blame(graph: ConceptGraph, conceptId: string, signature: string): BlameSuspect[] {
  return graph.data.explains
    .filter((e) => e.at === conceptId && e.signature === signature)
    .map((e) => ({ concept_id: e.blames, weight: e.weight, provenance: e.provenance }))
    .sort((a, b) => b.weight - a.weight);
}

/** An ordered remediation route from a foundational concept up to a goal concept. */
export function path(graph: ConceptGraph, from: string, to: string): string[] {
  if (from === to) return graph.node(from) ? [from] : [];
  if (!graph.node(from) || !graph.node(to)) return [];

  // requires edges point dependent -> prerequisite; walking from a
  // prerequisite toward what depends on it means walking them in reverse.
  const reverse = new Map<string, string[]>();
  for (const e of graph.data.requires) {
    if (!reverse.has(e.to)) reverse.set(e.to, []);
    reverse.get(e.to)!.push(e.from);
  }

  const queue: string[][] = [[from]];
  const visited = new Set<string>([from]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const last = current[current.length - 1];
    if (last === to) return current;
    for (const next of reverse.get(last) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push([...current, next]);
    }
  }
  return [];
}

/** Does this manifest's capability cover this concept? Pure capability match, no game names. */
export function matchesCapability(node: ConceptNode, manifest: CapabilityManifest): boolean {
  const repOverlap = node.representations.some((r) => manifest.assesses.representations.includes(r as any));
  const taskOverlap = node.task_types.some((t) => manifest.assesses.task_types.includes(t as any));
  const gradeOverlap = node.grade_band[0] <= manifest.grade_band[1] && manifest.grade_band[0] <= node.grade_band[1];
  return repOverlap && taskOverlap && gradeOverlap;
}

/** Which registered games (by manifest) can probe this concept. */
export function coverage(graph: ConceptGraph, conceptId: string, manifests: CapabilityManifest[]): string[] {
  const node = graph.node(conceptId);
  if (!node) return [];
  return manifests.filter((m) => matchesCapability(node, m)).map((m) => m.game_id);
}
