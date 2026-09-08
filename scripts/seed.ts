/**
 * Populates the real server data file (.data/evidence-log.jsonl) with a
 * plausible cohort history, so the tutor dashboard and child client have
 * something to show on first run. Safe to re-run against a fresh .data/
 * dir; re-running against an existing one is a no-op per student (the
 * evidence log dedupes by session_id).
 *
 * Usage: npm run seed
 */
import { graph, registry, itemBank, store, metaOf, directory } from "../server/state.js";
import { runCohort } from "../src/simulation/cohortRunner.js";
import { competent, misconceptionHolder, wheelSpinner, decayer } from "../src/simulation/profiles.js";
import { buildObservation } from "../src/sdk/observation.js";
import type { EvidenceBundle } from "../src/contracts/schemas.js";

const [maya, devon, priya, jonah, amara, leo] = directory.map((d) => d.student_id);

console.log("Running base cohort simulation against the real engine (in-memory store)...");
const { trace, store: simStore } = runCohort({
  graph,
  registry,
  itemBank,
  metaOf,
  students: [
    { id: maya, profile: misconceptionHolder("WHOLE_NUMBER_BIAS") },
    { id: devon, profile: wheelSpinner },
    { id: priya, profile: competent },
    { id: jonah, profile: misconceptionHolder("WHOLE_NUMBER_BIAS") },
    { id: amara, profile: decayer },
    { id: leo, profile: competent },
  ],
  rounds: 18,
  seed: "seed-cohort-v1",
});
console.log(`Simulated ${trace.length} session attempts.`);

// runCohort works against its own in-memory store; replay its evidence log
// into the real file-backed server store so the demo persists across
// restarts (ingest is idempotent per session_id, so re-running seed.ts
// against an already-seeded .data/ dir just skips duplicates).
let persisted = 0;
for (const b of simStore.allBundles()) {
  if (store.ingest(b).accepted) persisted++;
}
console.log(`Persisted ${persisted} new evidence bundles to the server store.`);

// Hand-authored evidence reproducing the architecture doc's own worked
// example (architecture.html #graph and #tutor wireframe): Maya and Jonah
// both show whole-number bias comparing fractions, which blame() traces
// back to F.MAG.UNIT. Injected directly -- evidence doesn't have to come
// from a live session to be valid evidence.
function wholeNumberBiasSession(studentId: string, sessionSuffix: string, startedAt: string): EvidenceBundle {
  const t0 = new Date(startedAt).getTime();
  const mk = (itemId: string, difficulty: number, offsetMs: number) =>
    buildObservation({
      item_id: itemId,
      concept_id: "F.MAG.CMP",
      difficulty,
      response: { kind: "position", value: 0.78, target: 0.125 },
      verdict: "incorrect",
      signature: "WHOLE_NUMBER_BIAS",
      signature_confidence: 0.9,
      startedAtMs: t0 + offsetMs,
      endedAtMs: t0 + offsetMs + 3000,
      attempts: 1,
    });

  return {
    session_id: `ses_seed_wnb_${studentId}_${sessionSuffix}`,
    student_id: studentId,
    assignment_id: `asg_seed_${studentId}_${sessionSuffix}`,
    game_id: "numberline.place.v2",
    started_at: startedAt,
    ended_at: new Date(t0 + 15000).toISOString(),
    observations: [mk(`itm_seed_${sessionSuffix}_1`, 0.3, 0), mk(`itm_seed_${sessionSuffix}_2`, 0.5, 4000), mk(`itm_seed_${sessionSuffix}_3`, 0.7, 8000)],
    engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
  };
}

const recentMonday = new Date();
recentMonday.setUTCDate(recentMonday.getUTCDate() - 10);

for (const [student, offsetDays] of [
  [maya, 0],
  [jonah, 1],
] as const) {
  for (const [suffix, dayOffset] of [
    ["a", 0],
    ["b", 4],
  ] as const) {
    const day = new Date(recentMonday.getTime() + (offsetDays + dayOffset) * 86_400_000).toISOString();
    const result = store.ingest(wholeNumberBiasSession(student, suffix, day));
    console.log(`  seeded F.MAG.CMP/WHOLE_NUMBER_BIAS session ${suffix} for ${student}:`, result);
  }
}

console.log("\nDone. Belief snapshots:");
for (const id of directory.map((d) => d.student_id)) {
  const belief = store.belief(id);
  const summary = [...belief.entries()].map(([c, b]) => `${c}:${b.status}`).join(", ");
  console.log(`  ${id.padEnd(12)} ${summary}`);
}
