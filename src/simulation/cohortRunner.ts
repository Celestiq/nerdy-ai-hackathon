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
 * Anchors a cohort run's simulated history to *wall-clock now* rather than
 * a fixed calendar date, so that a fresh `npm run seed` always ends its
 * simulated history a bounded, constant distance in the past -- freshly
 * mastered concepts stay mastered instead of decaying past threshold as
 * real time marches on past a hardcoded date (see BACKLOG.md / regression
 * fix: a stale fixed startDate meant zero naturally-MASTERED concepts
 * across the whole seeded cohort once enough real days had passed).
 *
 * REVIEW_MARGIN_DAYS (not zero!): the last simulated round lands
 * REVIEW_MARGIN_DAYS before "now", not on "now" itself. That margin is
 * load-bearing, not decorative -- see tests/simulation.test.ts's "no
 * candidate-starvation dead-end" suite. A learner who has mastered
 * everything currently reachable and is wheel-spin-blocked on the rest
 * (e.g. the seeded demo's stu_devon) has no live-playable candidate at
 * zero decay: every unblocked concept is freshly mastered (not yet due for
 * spaced review) and everything else is a hard wheel-spin block. Once
 * enough time passes for a mastered concept to decay past its own
 * threshold, it re-enters candidacy as a legitimate spaced-review item and
 * that learner has something to do again. Empirically (see this repo's
 * concept graph's decay half-lives) that takes ~11-13 days for this
 * cohort's specific concepts -- long enough to matter, short enough that
 * other, faster-decaying concepts elsewhere in the graph are still
 * "recently decayed" rather than ancient, so the demo reads as "picking
 * back up after a short break," not "abandoned for months." This is a
 * narrow empirical sweet spot for *this* graph + these seeded profiles,
 * not a universal constant -- if the graph's decay half-lives, the demo
 * cohort's profiles, or its coverage change, re-derive it.
 *
 * Quantized to the UTC calendar day (not full millisecond `Date.now()`
 * precision): two calls made moments apart -- e.g. the "same seed produces
 * an identical trace" test, which calls `runCohort` twice back-to-back
 * with no explicit `startDate` -- must resolve to the exact same default,
 * or the two traces' timestamps (and everything time-derived downstream:
 * belief decay, escalations) would diverge and the equality assertion
 * would flake.
 */
const REVIEW_MARGIN_DAYS = 12;

function defaultStartDate(rounds: number, dayStepDays: number): Date {
  const now = new Date();
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const lastRoundOffsetMs = Math.max(0, rounds - 1) * dayStepDays * 86_400_000;
  return new Date(todayUtcMidnight + 9 * 3_600_000 - REVIEW_MARGIN_DAYS * 86_400_000 - lastRoundOffsetMs);
}

/**
 * Drives synthetic learners through many simulated sessions against the
 * real engine and store. See architecture.html #build "Replay harness" and
 * roadmap.html C1.
 */
export function runCohort(opts: CohortRunOptions): CohortRunResult {
  const store = new LearnerStore(opts.metaOf);
  const trace: TraceEntry[] = [];
  const dayStep = opts.dayStepDays ?? 3;
  const startDate = opts.startDate ?? defaultStartDate(opts.rounds, dayStep);
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
