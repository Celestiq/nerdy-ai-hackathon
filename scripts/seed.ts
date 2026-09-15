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
import { competent, misconceptionHolder, strugglesOn, decayer, type LearnerProfile } from "../src/simulation/profiles.js";
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

// Seed timeline (Cycle 19 seed-recency lane). Each student's simulated
// history is its own runCohort call with its own length, spacing and
// last-session offset. Students are independent in runCohort (per-student
// belief and rng seed), so splitting them changes nothing else.
//
// The old shared timeline (cohortRunner defaults: 18 rounds 3 days apart,
// last round 12 days before now) left 7-11 of 15 stars faded per kid and
// maya/devon/jonah with 1 MASTERED once 3ee00e2 sped up concept progress.
// A shared 18-round, 2-day, 3-days-ago timeline fixed that but overshot:
// priya/amara/leo at 11-12 of 15 MASTERED, so live Play hit "All done for
// now" after ~4 sessions. The targets these numbers were tuned against, on a
// fresh seed, per kid: >=2 MASTERED at +0/+2/+4 days and >=10 of 12
// back-to-back live sessions served ("served/12" below: 12 sessions 10 min
// apart, the kid's own profile, the server's srv:<id>:<count> seed); plus
// >=2 kids whose next session is Balance Scale (priya via the F.MAG.NONUNIT
// bootstrap below, and amara), and the tutor diagnosis story: "needs extra
// support" with maya F.MAG.CMP, jonah F.MAG.CMP + F.MAG.NONUNIT and devon
// G.PART, and BOTH WHOLE_NUMBER_BIAS clusters (F.MAG.CMP, F.MAG.NONUNIT) for
// [maya, jonah]. maya/jonah need the full 18 rounds to reach fractions and
// get stuck there; being stuck on fractions keeps them in work, so their
// higher MASTERED count doesn't exhaust Play. Competent kids get short
// histories so they are mid-journey rather than nearly done.
// Measured (M at +0/+2/+4, faded at +0, served/12):
//   maya  18 rounds 2d apart, 3d ago:  9/9/9, 3, 12 (STUCK F.MAG.CMP)
//   devon 10 rounds 2d apart, 3d ago:  5/5/5, 0, 12 (STUCK G.PART)
//   priya  4 rounds 2d apart, 3d ago:  3/3/3, 0, 11 (next: Balance Scale)
//   jonah 18 rounds 2d apart, 3d ago:  8/6/6, 2, 12 (STUCK F.MAG.CMP, F.MAG.NONUNIT)
//   amara 16 rounds 5d apart, 2d ago:  4/4/4, 8, 12 (next: Balance Scale)
//   leo    8 rounds 2d apart, 3d ago:  5/5/5, 0, 12
// amara (the "decayer" profile) is the one deep, well-reviewed history:
// reaching F.EQV takes nearly the whole graph, and the only way to keep 10+
// live sessions of work at that depth is faded stars to refresh. Her result
// holds for last-session offsets 1-3 days; priya's for 1-6.
// cohortRunner's own default (REVIEW_MARGIN_DAYS) is untouched -- the
// simulation/starvation tests depend on it.
const WNB = misconceptionHolder("WHOLE_NUMBER_BIAS", { targetConcepts: ["F.MAG.CMP", "F.MAG.NONUNIT"] });
const SEED_TIMELINE: Array<{ id: string; profile: LearnerProfile; rounds: number; dayStepDays: number; lastSessionDaysAgo: number }> = [
  // Whole-number bias only shows up once they're actually comparing
  // fraction magnitudes (F.MAG.CMP/F.MAG.NONUNIT, the two concepts the
  // graph's `explains` edges name for this signature) -- elsewhere they're
  // competent, same as any other learner, so they progress through the
  // roots and one-hop concepts instead of stalling on either before ever
  // reaching a fraction. See BACKLOG.md dead-end fix: the old uniform
  // 0.55 correctness on *everything served* wheel-spin-blocked both roots
  // before mastery, regardless of the misconception being fraction-specific.
  { id: maya, profile: WNB, rounds: 18, dayStepDays: 2, lastSessionDaysAgo: 3 },
  // Genuinely never masters G.PART (demonstrates the wheel-spin/escalation
  // path live in the tutor view) but is competent everywhere else, so
  // N.COUNT and its whole downstream chain stay open. A uniform
  // `wheelSpinner` here dead-ends the entire session once *both* roots
  // wheel-spin-block, which is a real risk on a two-root graph -- see
  // BACKLOG.md dead-end fix.
  { id: devon, profile: strugglesOn(["G.PART"]), rounds: 10, dayStepDays: 2, lastSessionDaysAgo: 3 },
  { id: priya, profile: competent, rounds: 4, dayStepDays: 2, lastSessionDaysAgo: 3 },
  { id: jonah, profile: WNB, rounds: 18, dayStepDays: 2, lastSessionDaysAgo: 3 },
  { id: amara, profile: decayer, rounds: 16, dayStepDays: 5, lastSessionDaysAgo: 2 },
  { id: leo, profile: competent, rounds: 8, dayStepDays: 2, lastSessionDaysAgo: 3 },
];

function seedStartDate(rounds: number, dayStepDays: number, lastSessionDaysAgo: number): Date {
  const now = new Date();
  const todayUtc9am = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + 9 * 3_600_000;
  return new Date(todayUtc9am - (lastSessionDaysAgo + (rounds - 1) * dayStepDays) * 86_400_000);
}

console.log("Running base cohort simulation against the real engine (in-memory store)...");
// runCohort works against its own in-memory store; replay its evidence log
// into the real file-backed server store so the demo persists across
// restarts (ingest is idempotent per session_id, so re-running seed.ts
// against an already-seeded .data/ dir just skips duplicates).
let simulated = 0;
let persisted = 0;
for (const s of SEED_TIMELINE) {
  const { trace, store: simStore } = runCohort({
    graph,
    registry,
    itemBank,
    metaOf,
    students: [{ id: s.id, profile: s.profile }],
    rounds: s.rounds,
    seed: "seed-cohort-v1",
    dayStepDays: s.dayStepDays,
    startDate: seedStartDate(s.rounds, s.dayStepDays, s.lastSessionDaysAgo),
  });
  simulated += trace.length;
  for (const b of simStore.allBundles()) {
    const { accepted } = store.ingest(b);
    if (accepted) persisted++;
    await persistIfAccepted(accepted, b);
  }
}
console.log(`Simulated ${simulated} session attempts.`);
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
  // output below, not assumed. (Cycle 19 re-measure, fresh seed with
  // SEED_TIMELINE: stu_devon's N.COUNT ends at p_mastery 0.919 / p_decayed
  // 0.913, 9 simulated obs + these 8.)
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
// seeded student naturally crosses that gate without it. With SEED_TIMELINE's
// short 4-round history, stu_priya (competent profile) has no simulated
// F.MAG.NONUNIT evidence at all -- this bundle is her entire evidence for
// it, which is also what makes Balance Scale her next session. (Under the
// old 18-round shared history she reached ~0.80 / 0.72 on her own.) Same
// discipline as
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
// snapshot below (not assumed): 8 full passes over the 2 real items (16
// correct observations) landed at p_mastery 0.940 / p_decayed 0.929 when
// sized (with 4 simulated obs), 0.914 / 0.903 in Cycle 18 (9 simulated obs,
// recency-weighted p_mastery, src/store/types.ts RECENCY_GRACE_OBS), and
// 0.926 / 0.915 in Cycle 19 with SEED_TIMELINE (0 simulated obs, bundle
// only; dated yesterday) -- all comfortably clear of the 0.85
// gate (a smaller 2-pass bundle only reached 0.873/0.864 when sized, too thin a margin
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
