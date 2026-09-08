import { CapabilityManifestSchema, type CapabilityManifest } from "../contracts/schemas.js";
import type { ConceptGraph } from "../graph/loader.js";
import { matchesCapability } from "../graph/query.js";

export interface RegisterResult {
  ok: boolean;
  errors?: string[];
}

/**
 * Game registry: holds Capability Manifests, answers "which registered
 * games can probe this concept?" via capability matching, not by name.
 * See architecture.html #games and roadmap.html C5.
 */
export class GameRegistry {
  private manifests = new Map<string, CapabilityManifest>();

  register(raw: unknown): RegisterResult {
    const parsed = CapabilityManifestSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    }
    this.manifests.set(parsed.data.game_id, parsed.data);
    return { ok: true };
  }

  get(gameId: string): CapabilityManifest | undefined {
    return this.manifests.get(gameId);
  }

  all(): CapabilityManifest[] {
    return [...this.manifests.values()];
  }

  /** Which registered games can probe this concept, matched on capability alone. */
  matchConcept(graph: ConceptGraph, conceptId: string): CapabilityManifest[] {
    const node = graph.node(conceptId);
    if (!node) return [];
    return this.all().filter((m) => matchesCapability(node, m));
  }

  /** Which registered games can probe every concept in this set (candidates for one assignment). */
  matchConcepts(graph: ConceptGraph, conceptIds: string[]): CapabilityManifest[] {
    if (conceptIds.length === 0) return [];
    const sets = conceptIds.map((c) => new Set(this.matchConcept(graph, c).map((m) => m.game_id)));
    const first = sets[0];
    const commonIds = [...first].filter((id) => sets.every((s) => s.has(id)));
    return commonIds.map((id) => this.manifests.get(id)!);
  }

  /** Concepts in the graph that no registered game can currently assess. */
  coverageReport(graph: ConceptGraph): string[] {
    const uncovered: string[] = [];
    for (const node of graph.nodes.values()) {
      const covered = this.all().some((m) => matchesCapability(node, m));
      if (!covered) uncovered.push(node.concept_id);
    }
    return uncovered;
  }
}
