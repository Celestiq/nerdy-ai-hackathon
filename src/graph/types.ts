export interface ConceptNode {
  concept_id: string;
  label: string;
  strand: string;
  grade_band: [number, number];
  representations: string[];
  task_types: string[];
  mastery_threshold: number;
  decay_half_life_days: number;
  /** "authored" strand is real pedagogy; "stub" exists to shape the rest of K-5. */
  status: "authored" | "stub";
}

export interface RequiresEdge {
  from: string;
  to: string;
  strength: "hard" | "supporting";
}

export interface ExplainsEdge {
  at: string;
  signature: string;
  blames: string;
  weight: number;
  provenance: string;
}

export interface ConceptGraphData {
  version: string;
  nodes: ConceptNode[];
  requires: RequiresEdge[];
  explains: ExplainsEdge[];
}
