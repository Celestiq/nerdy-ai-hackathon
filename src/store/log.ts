import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { EvidenceBundle } from "../contracts/schemas.js";

/**
 * Append-only evidence log. No update path exists in this code, not merely
 * unused: there is no method here that mutates a stored bundle, only
 * `append` (idempotent per session_id) and readers.
 */
export class EvidenceLog {
  private bundles: EvidenceBundle[] = [];
  private seenSessions = new Set<string>();
  private readonly filePath?: string;

  constructor(filePath?: string) {
    this.filePath = filePath;
    if (filePath && existsSync(filePath)) {
      const lines = readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
      for (const line of lines) {
        const bundle = JSON.parse(line) as EvidenceBundle;
        this.bundles.push(bundle);
        this.seenSessions.add(bundle.session_id);
      }
    }
  }

  /** Returns false if this session_id was already ingested (idempotent). */
  append(bundle: EvidenceBundle): boolean {
    if (this.seenSessions.has(bundle.session_id)) return false;
    this.bundles.push(bundle);
    this.seenSessions.add(bundle.session_id);
    if (this.filePath) {
      mkdirSync(dirname(this.filePath), { recursive: true });
      appendFileSync(this.filePath, JSON.stringify(bundle) + "\n");
    }
    return true;
  }

  all(): readonly EvidenceBundle[] {
    return this.bundles;
  }

  forStudent(studentId: string): EvidenceBundle[] {
    return this.bundles.filter((b) => b.student_id === studentId);
  }

  studentIds(): string[] {
    return [...new Set(this.bundles.map((b) => b.student_id))];
  }
}
