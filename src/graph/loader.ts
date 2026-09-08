import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ConceptGraphData, ConceptNode } from "./types.js";
import { validateGraph } from "./validate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_PATH = join(__dirname, "data", "strand-magnitude-fractions.json");

export class ConceptGraph {
  readonly version: string;
  readonly nodes: Map<string, ConceptNode>;
  readonly data: ConceptGraphData;

  private constructor(data: ConceptGraphData) {
    this.data = data;
    this.version = data.version;
    this.nodes = new Map(data.nodes.map((n) => [n.concept_id, n]));
  }

  static load(path: string = DEFAULT_DATA_PATH): ConceptGraph {
    const raw = readFileSync(path, "utf-8");
    const data = JSON.parse(raw) as ConceptGraphData;
    const result = validateGraph(data);
    if (!result.ok) {
      throw new Error(`concept graph failed structural validation:\n  - ${result.errors.join("\n  - ")}`);
    }
    return new ConceptGraph(data);
  }

  node(conceptId: string): ConceptNode | undefined {
    return this.nodes.get(conceptId);
  }
}
