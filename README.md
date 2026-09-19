# nerdy-ai

Adaptive concept assessment for K–5 math, built end-to-end from an internal
architecture and roadmap spec (not included in this repo). This README
covers what's implemented and how to run it.

The core idea: **games are interchangeable, judgement is centralised.** A
game runs five minutes of play and reports observations, never a verdict.
A concept graph, a learner store, a selection engine and a tutor-analytics
layer do all the interpreting, talking to each other and to games only
through four fixed contracts (Manifest, Evidence, Belief, Assignment).

## What's implemented

This is a compressed, single-pass build, scoped down from a larger
4–6 person / multi-phase team plan:

- **Contracts** (`src/contracts`) — zod schemas for all four contracts, a
  closed signature-code vocabulary, concept-id validation, and reference
  fixtures (valid + invalid) for each contract.
- **Concept graph** (`src/graph`) — one strand authored to real depth
  (magnitude → fractions → decimals; 83 nodes, 127 `requires` and 7
  `explains` edges across 8 strands), both `requires` and
  `explains` edges, structural validation (acyclic, provenance-required),
  and the four-call query surface: `frontier`, `blame`, `path`, `coverage`.
- **Learner store** (`src/store`) — append-only evidence log with no update
  path, and a pure-projection belief model (Beta-Bernoulli mastery,
  confidence from count/agreement/spread/recency, time-decay, wheel-spin
  counting, five-state status). Local/dev: file-backed JSONL. Production:
  Postgres/Supabase (`server/db.ts`, `db/schema.sql`) — see "Database"
  below.
- **Game registry** (`src/registry`) — capability-based manifest matching
  (never by game name) plus an item-bank registry so the engine never
  imports a specific game.
- **Selection engine** (`src/engine`) — candidates → scoring → hard
  constraints (wheel-spin block, prerequisite gate, coverage, variety) →
  game match → item assembly → Assignment, with a full decision log and an
  explicit cold-start policy. Each game's small fixed anchor item set is
  served to every child as common cohort items, except an anchor whose
  concept is STUCK for that child, which is skipped and logged as
  "anchor skipped: stuck".
- **Game SDK** (`src/sdk`) — observation builder (signature is a required
  param, not optional), a conformance test suite, and a null game.
- **Three games** (`src/games`) — `numberline.place.v2` (magnitude
  placement, signature-by-construction via authored response regions),
  `fractionbars.compare.v1` and `balancescale.compare.v1` (further
  mechanics/representations, each registered through the manifest +
  item-bank registries alone — zero engine or store changes, proving each
  game is truly interchangeable).
- **Analytics** (`src/analytics`) — stuck list, misconception clustering
  with blamed root cause, retention alerts, concept coverage (unmeasured
  kept strictly distinct from weak), and a templated opening move.
- **Simulation harness** (`src/simulation`) — seven synthetic learner
  profiles (competent, misconception-holder, wheel-spinner, struggles-on,
  rapid-guesser, abandoner, decayer), a deterministic cohort runner, and a
  routing-failure self-check.
- **Server + two frontends** (`server`, `public`) — an Express API wiring
  everything together, a child play surface (no score, no leaderboard,
  no comparison) and a tutor dashboard (five prioritised blocks, unmeasured
  rendered distinctly from weak).

### What's deliberately out of scope

- No separate identity/privacy microservice — students are opaque IDs
  from a small in-memory directory, not a real auth system.
- No live LLM item generation — the item bank is hand-authored;
  authoring depth, not item count, is the real cost.

## Running it

```bash
npm install
npm run seed      # populate .data/ with a demo cohort (safe to re-run)
npm run dev        # http://localhost:5173
```

- Child view: http://localhost:5173/child/
- Tutor view: http://localhost:5173/tutor/

Other scripts:

```bash
npm test            # 195 tests, 19 files: contracts, graph, store, registry, engine, analytics, sdk, simulation
npm run typecheck
npm run simulate -- 40 my-seed   # headless cohort run against the real engine, prints a trace + routing self-check
```

## Database

No setup needed for local dev/demo: with no `DATABASE_URL` set, evidence
persists to a local file (`.data/evidence-log.jsonl`) exactly as before.

For a real deployment, evidence should survive a restart/redeploy, which a
local file on most hosts' ephemeral disks won't. Point the server at a
Postgres database (a free [Supabase](https://supabase.com) project works
well) instead:

1. Create a Supabase project, then in its SQL Editor run `db/schema.sql`
   (creates one table, `evidence_bundles` — insert-only, deduped by
   `session_id`, same shape as the file log it replaces).
2. Copy its connection string (Project Settings → Database → Connection
   string; use the **Transaction pooler**, port 6543, for a serverless or
   multi-request-per-process host) into `DATABASE_URL`. Copy `.env.example`
   to `.env` for local testing, or set it as a real env var on your host.
3. `npm start` (or `npm run dev`). On boot the server hydrates its
   in-memory belief store by replaying every row already in Postgres, then
   every accepted `/api/evidence` submission is mirrored into Postgres
   before the request is acknowledged. `npm run seed` also persists to
   Postgres when `DATABASE_URL` is set, so the demo cohort survives a
   redeploy too.
4. `GET /api/health` reports `db: "connected" | "disabled" | "error"`.

Design notes (see `server/db.ts` for the full reasoning):

- This is additive, not a rewrite: `src/store` (the append-only log + pure
  belief projection) is unchanged and still the thing every test, the
  simulation harness, and `scripts/simulate.ts` run against in memory.
  Postgres is a durability layer the server (`server/state.ts`,
  `server/routes.ts`) and `scripts/seed.ts` opt into when configured.
- Single-instance scoped: each process hydrates its own in-memory copy at
  boot. Fine for one running server (this project's actual deploy target);
  a second concurrent replica wouldn't see the first one's writes until its
  own restart. Revisit if this ever needs more than one replica.

## Proof points

- **Root-cause diagnosis:** run `npm run seed`, then open the tutor
  view — Maya and Jonah both show up under "Shared misconceptions" with
  `WHOLE_NUMBER_BIAS` on `F.MAG.CMP`, traced back to `F.MAG.UNIT`.
  Nobody told the system that root cause; `blame()` found it from the
  graph's `explains` edges.
- **Extensibility:** `fractionbars.compare.v1`
  (`src/games/fractionbars`) is a second mechanic, a second
  representation (`AREA_MODEL`), registered via `server/state.ts` calling
  `registry.register()` and `itemBank.register()`. `src/engine` and
  `src/store` never import it.
- **Wheel-spin escalation:** `tests/engine.test.ts` and
  `tests/simulation.test.ts` drive a `wheelSpinner` profile through many
  sessions and assert escalation happens within the attempt limit, and
  that the stuck concept keeps escalating to the tutor every round it
  stays stuck. It's normally never served again once blocked -- except as
  a last-resort fallback when it's the only candidate left at all (see
  "starvation fallback" below), in which case re-serving it is logged
  explicitly, not silent.
- **Starvation fallback:** the selection engine used to return no
  assignment at all -- a dead end for the child surface -- whenever
  every candidate concept was wheel-spin-blocked simultaneously (see
  `src/engine/constraints.ts`'s `applyHardConstraints`). It now relaxes
  the wheel-spin block for exactly one candidate (highest score, ties
  broken by longest-blocked) in that case only, leaving the prerequisite
  gate untouched, and logs the relaxation in that assignment's
  `decision_log` as `"wheel-spin relaxed: no other candidate available"`.
  `tests/simulation.test.ts` and `tests/engine.test.ts` cover both the
  no-more-than-one-consecutive-starved-round guarantee and the decision
  log's auditability.
