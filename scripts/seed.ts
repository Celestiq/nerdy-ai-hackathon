/**
 * Populates the real server data file (.data/evidence-log.jsonl) with a
 * plausible cohort history, so the tutor dashboard and child client have
 * something to show on first run. Safe to re-run against a fresh .data/
 * dir; re-running against an existing one is a no-op per student (the
 * evidence log dedupes by session_id).
 *
 * Usage: npm run seed
 */
import "dotenv/config";
import { graph, registry, itemBank, store, metaOf, directory, dbConfigured } from "../server/state.js";
import { persistBundle, closeDb } from "../server/db.js";
import { runCohort } from "../src/simulation/cohortRunner.js";
import { competent, misconceptionHolder, strugglesOn, decayer } from "../src/simulation/profiles.js";
import { buildObservation } from "../src/sdk/observation.js";
import type { EvidenceBundle } from "../src/contracts/schemas.js";

// When DATABASE_URL is set, server/state.js has already hydrated `store`
// from Postgres (see server/db.ts), so every ingest() below dedupes
// correctly against production history too -- this helper just mirrors
// each newly-accepted bundle into Postgres the same way the live
// /api/evidence route does, so a seeded demo cohort survives a redeploy.
async function persistIfAccepted(accepted: boolean, bundle: EvidenceBundle): Promise<void> {
  if (accepted && dbConfigured) await persistBundle(bundle);
}

const [maya, devon, priya, jonah, amara, leo] = directory.map((d) => d.student_id);

console.log("Running base cohort simulation against the real engine (in-memory store)...");
const { trace, store: simStore } = runCohort({
  graph,
  registry,
  itemBank,
  metaOf,
  students: [
    // Whole-number bias only shows up once they're actually comparing
    // fraction magnitudes (F.MAG.CMP/F.MAG.NONUNIT, the two concepts the
    // graph's `explains` edges name for this signature) -- elsewhere they're
    // competent, same as any other learner, so they progress through the
    // roots and one-hop concepts instead of stalling on either before ever
    // reaching a fraction. See BACKLOG.md dead-end fix: the old uniform
    // 0.55 correctness on *everything served* wheel-spin-blocked both roots
    // before mastery, regardless of the misconception being fraction-specific.
    { id: maya, profile: misconceptionHolder("WHOLE_NUMBER_BIAS", { targetConcepts: ["F.MAG.CMP", "F.MAG.NONUNIT"] }) },
    // Genuinely never masters G.PART (demonstrates the wheel-spin/escalation
    // path live in the tutor view) but is competent everywhere else, so
    // N.COUNT and its whole downstream chain stay open. A uniform
    // `wheelSpinner` here dead-ends the entire session once *both* roots
    // wheel-spin-block, which is a real risk on a two-root graph -- see
    // BACKLOG.md dead-end fix.
    { id: devon, profile: strugglesOn(["G.PART"]) },
    { id: priya, profile: competent },
    { id: jonah, profile: misconceptionHolder("WHOLE_NUMBER_BIAS", { targetConcepts: ["F.MAG.CMP", "F.MAG.NONUNIT"] }) },
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
  const { accepted } = store.ingest(b);
  if (accepted) persisted++;
  await persistIfAccepted(accepted, b);
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
    const bundle = wholeNumberBiasSession(student, suffix, day);
    const result = store.ingest(bundle);
    await persistIfAccepted(result.accepted, bundle);
    console.log(`  seeded F.MAG.CMP/WHOLE_NUMBER_BIAS session ${suffix} for ${student}:`, result);
  }
}

// Hand-authored bootstrap bundle restoring a demo-critical guarantee: at
// least one concept-student pair naturally reaches MASTERED on a fresh
// seed, independent of cohortRunner's stochastic simulated history. This
// area has broken three times this session purely from cohortRunner/
// timing-constant changes (see BACKLOG.md Cycle 9) -- unlike
// wholeNumberBiasSession above (which uses placeholder item ids, since it
// only needs a signature-classified *incorrect* response), this one is
// graded on p_mastery/p_decayed crossing the real 0.85 threshold, so it
// must use real, already-authored N.COUNT items (src/games/numberline/
// items.ts) with responses that genuinely match each item's target, not
// placeholder ids. stu_devon/N.COUNT specifically: the exact pair Cycles
// 7-8 already established and verified live, now decoupled from
// cohortRunner's selection dynamics entirely so an unrelated future
// content change (e.g. new items elsewhere in the bank) can't silently tip
// it again -- the exact failure mode Cycle 9 hit.
function masteryBootstrapSession(studentId: string, startedAt: string): EvidenceBundle {
  const t0 = new Date(startedAt).getTime();
  // Real N.COUNT items from src/games/numberline/items.ts, confirmed by
  // reading that file directly (item_id, difficulty, target, tolerance
  // copied verbatim -- not fabricated).
  const items: Array<{ item_id: string; difficulty: number; target: number }> = [
    { item_id: "itm_nc_7", difficulty: 0.2, target: 0.7 },
    { item_id: "itm_nc_3", difficulty: 0.15, target: 0.3 },
    { item_id: "itm_nc_5", difficulty: 0.18, target: 0.5 },
    { item_id: "itm_nc_9", difficulty: 0.25, target: 0.9 },
  ];
  const mk = (item: (typeof items)[number], offsetMs: number) =>
    buildObservation({
      item_id: item.item_id,
      concept_id: "N.COUNT",
      difficulty: item.difficulty,
      response: { kind: "position", value: item.target, target: item.target },
      verdict: "correct",
      signature: "UNCLASSIFIED",
      signature_confidence: 0.95,
      startedAtMs: t0 + offsetMs,
      endedAtMs: t0 + offsetMs + 3000,
      attempts: 1,
    });

  // Two full passes over the 4 real N.COUNT items (8 observations total):
  // a single pass (4 obs) empirically left p_decayed at 0.885 against the
  // 0.85 threshold -- real, but not "comfortably clear" per this item's
  // spec, since it also has to absorb whatever N.COUNT evidence
  // cohortRunner's stochastic simulation independently contributes for
  // this student (belief is a full replay over every bundle, not just this
  // one). A second pass pushes p_mastery, and therefore p_decayed, further
  // above threshold -- verified empirically against the real printed
  // output below, not assumed.
  const rounds = [...items, ...items];

  return {
    session_id: `ses_seed_mastery_${studentId}`,
    student_id: studentId,
    assignment_id: `asg_seed_mastery_${studentId}`,
    game_id: "numberline.place.v2",
    started_at: startedAt,
    ended_at: new Date(t0 + rounds.length * 4000).toISOString(),
    observations: rounds.map((item, i) => mk(item, i * 4000)),
    engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
  };
}

// Timed "yesterday" at seed time -- close to wall-clock "now", not anchored
// to cohortRunner's internal REVIEW_MARGIN_DAYS/defaultStartDate window --
// so p_decayed's tiny one-day decay factor keeps this comfortably clear of
// the 0.85 threshold regardless of any future retuning of that constant.
const yesterday = new Date();
yesterday.setUTCDate(yesterday.getUTCDate() - 1);
const masteryBundle = masteryBootstrapSession(devon, yesterday.toISOString());
const masteryResult = store.ingest(masteryBundle);
await persistIfAccepted(masteryResult.accepted, masteryBundle);
console.log(`  seeded N.COUNT mastery-bootstrap session for ${devon}:`, masteryResult);

// Hand-authored bootstrap unblocking F.EQV/balancescale.compare.v1's live
// reachability (BACKLOG.md "Balance Scale" item, part a): F.EQV hard-requires
// F.MAG.NONUNIT >= 0.85 p_mastery (strand-magnitude-fractions.json), and no
// seeded student naturally crosses that gate -- stu_priya (competent
// profile) is closest, at a stochastic p_mastery 0.798 / p_decayed 0.671
// after the base cohort simulation above. Same discipline as
// masteryBootstrapSession: real, already-authored F.MAG.NONUNIT items (only
// two exist today, src/games/numberline/items.ts), verdict "correct"
// responses placed exactly at each item's target, decoupled from
// cohortRunner's stochastic timing. Note the hard-prerequisite gate itself
// (src/engine/constraints.ts, src/graph/query.ts's frontier()) reads
// p_mastery only, never p_decayed -- but this bundle is sized to clear both
// comfortably, since p_decayed also drives this concept's own displayed
// status (EMERGING/MASTERED) on the tutor/child surfaces.
//
// Sizing, verified empirically against this script's own printed belief
// snapshot below (not assumed): stu_priya already carries 4 real
// observations toward F.MAG.NONUNIT from the base simulation. Repeating the
// 2 real items as 8 full passes (16 additional correct observations) lands
// at p_mastery 0.940 / p_decayed 0.929 -- both comfortably clear of the 0.85
// gate (a smaller 2-pass bundle only reaches 0.873/0.864, too thin a margin
// to survive any future retuning of the decay/confidence constants, per the
// exact regression class BACKLOG.md's Cycle 9 hit).
function fmagNonunitBootstrapSession(studentId: string, startedAt: string): EvidenceBundle {
  const t0 = new Date(startedAt).getTime();
  // Real F.MAG.NONUNIT items from src/games/numberline/items.ts, confirmed
  // by reading that file directly (item_id, difficulty, target copied
  // verbatim -- not fabricated).
  const items: Array<{ item_id: string; difficulty: number; target: number }> = [
    { item_id: "itm_fn_3_4", difficulty: 0.45, target: 0.75 },
    { item_id: "itm_fn_2_5", difficulty: 0.5, target: 0.4 },
  ];
  const mk = (item: (typeof items)[number], offsetMs: number) =>
    buildObservation({
      item_id: item.item_id,
      concept_id: "F.MAG.NONUNIT",
      difficulty: item.difficulty,
      response: { kind: "position", value: item.target, target: item.target },
      verdict: "correct",
      signature: "UNCLASSIFIED",
      signature_confidence: 0.95,
      startedAtMs: t0 + offsetMs,
      endedAtMs: t0 + offsetMs + 3000,
      attempts: 1,
    });
  const PASSES = 8;
  const rounds = Array.from({ length: PASSES }, () => items).flat();

  return {
    session_id: `ses_seed_fmagnonunit_${studentId}`,
    student_id: studentId,
    assignment_id: `asg_seed_fmagnonunit_${studentId}`,
    game_id: "numberline.place.v2",
    started_at: startedAt,
    ended_at: new Date(t0 + rounds.length * 4000).toISOString(),
    observations: rounds.map((item, i) => mk(item, i * 4000)),
    engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
  };
}
const fmagBundle = fmagNonunitBootstrapSession(priya, yesterday.toISOString());
const fmagResult = store.ingest(fmagBundle);
await persistIfAccepted(fmagResult.accepted, fmagBundle);
console.log(`  seeded F.MAG.NONUNIT mastery-bootstrap session for ${priya}:`, fmagResult);

console.log("\nDone. Belief snapshots:");
let sawMastered = false;
for (const id of directory.map((d) => d.student_id)) {
  const belief = store.belief(id);
  const summary = [...belief.entries()].map(([c, b]) => `${c}:${b.status}`).join(", ");
  console.log(`  ${id.padEnd(12)} ${summary}`);
  for (const b of belief.values()) {
    if (b.status === "MASTERED") sawMastered = true;
  }
}

// Regression guard: a fresh seed must always produce at least one naturally
// MASTERED concept-student pair (the mastery-moment celebratory beat and
// the Concept Constellation's "bloom" tier are both unreachable via the
// documented `npm run seed && npm run dev` setup path otherwise). This is
// the guard that should have caught Cycle 9's regression before commit --
// see BACKLOG.md Cycle 9.
await closeDb(); // otherwise the pg pool's open sockets keep this one-shot script's process alive

if (!sawMastered) {
  console.error(
    "\nFAIL: no concept-student pair naturally reached MASTERED on this fresh seed -- see BACKLOG.md Cycle 9.",
  );
  process.exit(1);
}
