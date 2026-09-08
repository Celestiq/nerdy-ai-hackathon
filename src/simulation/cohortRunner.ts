import type { ConceptGraph } from "../graph/loader.js";
import type { GameRegistry, ItemBankRegistry, ItemBankEntry } from "../registry/index.js";
import { LearnerStore } from "../store/store.js";
import type { ConceptMetaLookup } from "../store/projector.js";
import { selectNext } from "../engine/engine.js";
import { mulberry32, seedToInt } from "./rng.js";
import type { LearnerProfile } from "./profiles.js";

export interface SimStudent {
  id: string;
  profile: LearnerProfile;
}

export interface TraceEntry {
  round: number;
  student_id: string;
  simulated_at: string;
  assignment_id?: string;
  game_id?: string;
  concepts: string[];
  blocked_reason?: string;
  escalations: string[];
  statuses: Record<string, string>;
}

export interface CohortRunOptions {
  graph: ConceptGraph;
  registry: GameRegistry;
  itemBank: ItemBankRegistry;
  metaOf: ConceptMetaLookup;
  students: SimStudent[];
  rounds: number;
  seed: string;
  startDate?: Date;
  dayStepDays?: number;
  anchors?: Map<string, ItemBankEntry[]>;
}

export interface CohortRunResult {
  store: LearnerStore;
  trace: TraceEntry[];
}

/**
 * Drives synthetic learners through many simulated sessions against the
 * real engine and store. See architecture.html #build "Replay harness" and
 * roadmap.html C1.
 */
export function runCohort(opts: CohortRunOptions): CohortRunResult {
  const store = new LearnerStore(opts.metaOf);
  const trace: TraceEntry[] = [];
  const startDate = opts.startDate ?? new Date("2026-01-05T09:00:00Z");
  const dayStep = opts.dayStepDays ?? 3;
  const anchors = opts.anchors ?? new Map<string, ItemBankEntry[]>();

  for (let round = 0; round < opts.rounds; round++) {
    for (const student of opts.students) {
      const simulatedAt = new Date(startDate.getTime() + round * dayStep * 86_400_000);
      const belief = store.belief(student.id, simulatedAt);
      const seedStr = `${opts.seed}:${student.id}:${round}`;
      const rng = mulberry32(seedToInt(seedStr));

      const result = selectNext({
        studentId: student.id,
        graph: opts.graph,
        belief,
        registry: opts.registry,
        itemBank: opts.itemBank,
        anchors,
        seed: seedStr,
        now: simulatedAt,
      });

      if (!result.assignment) {
        trace.push({
          round,
          student_id: student.id,
          simulated_at: simulatedAt.toISOString(),
          concepts: [],
          blocked_reason: result.reason,
          escalations: result.escalations,
          statuses: snapshotStatuses(belief),
        });
        continue;
      }

      const bundle = student.profile(result.assignment, { rng, simulatedAtMs: simulatedAt.getTime(), sessionSeq: round });
      store.ingest(bundle);
      const newBelief = store.belief(student.id, simulatedAt);

      trace.push({
        round,
        student_id: student.id,
        simulated_at: simulatedAt.toISOString(),
        assignment_id: result.assignment.assignment_id,
        game_id: result.assignment.game_id,
        concepts: result.assignment.concepts,
        escalations: result.escalations,
        statuses: snapshotStatuses(newBelief),
      });
    }
  }

  return { store, trace };
}

function snapshotStatuses(belief: Map<string, { status: string }>): Record<string, string> {
  return Object.fromEntries([...belief.entries()].map(([k, v]) => [k, v.status]));
}

/**
 * Self-check: detects an engine that always serves the same concept set to
 * a student, regardless of belief evolution. See roadmap.html C1
 * "Self-check".
 */
export function detectRoutingFailure(trace: TraceEntry[], studentId: string, minRounds = 5): string | null {
  const rows = trace.filter((t) => t.student_id === studentId && t.concepts.length > 0);
  if (rows.length < minRounds) return null;
  const first = JSON.stringify([...rows[0].concepts].sort());
  const allSame = rows.every((r) => JSON.stringify([...r.concepts].sort()) === first);
  return allSame ? `student ${studentId} was served the same concept set (${first}) for all ${rows.length} rounds -- looks like a routing failure` : null;
}
