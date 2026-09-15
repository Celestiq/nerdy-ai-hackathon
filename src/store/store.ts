import { EvidenceBundleSchema, type EvidenceBundle } from "../contracts/schemas.js";
import { EvidenceLog } from "./log.js";
import { project, type ConceptMetaLookup, type ProjectorOptions } from "./projector.js";
import type { BeliefInternal } from "./types.js";

export interface IngestResult {
  accepted: boolean;
  duplicate: boolean;
  errors?: string[];
}

/**
 * Learner store: ingest -> append-only log -> projector -> belief.
 * See architecture.html #store. Owns no pedagogy: metaOf is supplied by the
 * caller so this module never imports the graph.
 */
export class LearnerStore {
  private readonly log: EvidenceLog;
  private readonly metaOf: ConceptMetaLookup;
  private readonly options: ProjectorOptions;

  /** `options` (e.g. `isAnchorItem`) is passed straight to the projector; omit it for the default rules. */
  constructor(metaOf: ConceptMetaLookup, filePath?: string, options: ProjectorOptions = {}) {
    this.log = new EvidenceLog(filePath);
    this.metaOf = metaOf;
    this.options = options;
  }

  ingest(raw: unknown): IngestResult {
    const parsed = EvidenceBundleSchema.safeParse(raw);
    if (!parsed.success) {
      return { accepted: false, duplicate: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    }
    const appended = this.log.append(parsed.data);
    return { accepted: appended, duplicate: !appended };
  }

  /** Full rebuild: belief is always a pure projection of the log, so this is just "call project again". */
  belief(studentId: string, now: Date = new Date()): Map<string, BeliefInternal> {
    return project(studentId, this.log.forStudent(studentId), this.metaOf, now, this.options);
  }

  beliefFor(studentId: string, conceptId: string, now: Date = new Date()): BeliefInternal | undefined {
    return this.belief(studentId, now).get(conceptId);
  }

  studentIds(): string[] {
    return this.log.studentIds();
  }

  bundlesFor(studentId: string): EvidenceBundle[] {
    return this.log.forStudent(studentId);
  }

  allBundles(): readonly EvidenceBundle[] {
    return this.log.all();
  }
}
