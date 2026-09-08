# nerdy-ai

Adaptive concept assessment for K–5 math. Built end-to-end from the spec in
`docs/architecture.html` and `docs/roadmap.html` — read those first; this
README is just how to run what they describe.

The core idea: **games are interchangeable, judgement is centralised.** A
game runs five minutes of play and reports observations, never a verdict.
A concept graph, a learner store, a selection engine and a tutor-analytics
layer do all the interpreting, talking to each other and to games only
through four fixed contracts (Manifest, Evidence, Belief, Assignment).

## What's implemented

This is a compressed, single-pass build of the roadmap's milestones
M1–M5, scoped down from its 4–6 person / multi-phase team plan:

- **Contracts** (`src/contracts`) — zod schemas for all four contracts, a
  closed signature-code vocabulary, concept-id validation, and reference
  fixtures (valid + invalid) for each contract.
- **Concept graph** (`src/graph`) — one strand authored to real depth
  (magnitude → fractions → decimals, 20 nodes), both `requires` and
  `explains` edges, structural validation (acyclic, provenance-required),
  and the four-call query surface: `frontier`, `blame`, `path`, `coverage`.
- **Learner store** (`src/store`) — append-only evidence log (file-backed
  JSONL) with no update path, and a pure-projection belief model
  (Beta-Bernoulli mastery, confidence from count/agreement/spread/recency,
  time-decay, wheel-spin counting, five-state status).
- **Game registry** (`src/registry`) — capability-based manifest matching
  (never by game name) plus an item-bank registry so the engine never
  imports a specific game.
- **Selection engine** (`src/engine`) — candidates → scoring → hard
  constraints (wheel-spin block, prerequisite gate, coverage, variety) →
  game match → item assembly → Assignment, with a full decision log and an
  explicit cold-start policy.
- **Game SDK** (`src/sdk`) — observation builder (signature is a required
  param, not optional), a conformance test suite, and a null game.
- **Two games** (`src/games`) — `numberline.place.v2` (magnitude
  placement, signature-by-construction via authored response regions) and
  `fractionbars.compare.v1` (a second mechanic/representation, registered
  through the manifest + item-bank registries alone — zero engine or store
  changes, proving the extensibility claim from roadmap.html C13).
- **Analytics** (`src/analytics`) — stuck list, misconception clustering
  with blamed root cause, retention alerts, concept coverage (unmeasured
  kept strictly distinct from weak), and a templated opening move.
- **Simulation harness** (`src/simulation`) — six synthetic learner
  profiles (competent, misconception-holder, wheel-spinner, rapid-guesser,
  abandoner, decayer), a deterministic cohort runner, and a routing-failure
  self-check.
- **Server + two frontends** (`server`, `public`) — an Express API wiring
  everything together, a child play surface (no score, no leaderboard,
  no comparison) and a tutor dashboard (five prioritised blocks, unmeasured
  rendered distinctly from weak).

### What's deliberately out of scope

- No separate identity/privacy microservice (roadmap C2) — students are
  opaque IDs from a small in-memory directory, not a real auth system.
- No live LLM item generation (roadmap C12) — the item bank is
  hand-authored, per the architecture doc's own guidance that authoring
  depth, not item count, is the real cost.
- No production datastore — the evidence log is a local JSONL file.

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
npm test            # 82 tests: contracts, graph, store, registry, engine, analytics, sdk, simulation
npm run typecheck
npm run simulate -- 40 my-seed   # headless cohort run against the real engine, prints a trace + routing self-check
```

## Proving the architecture's own claims

- **The diagnostic claim (G4 in roadmap.html):** run `npm run seed`, then
  open the tutor view — Maya and Jonah both show up under "Shared
  misconceptions" with `WHOLE_NUMBER_BIAS` on `F.MAG.CMP`, traced back to
  `F.MAG.UNIT`, exactly the worked example in architecture.html #graph.
  Nobody told the system that root cause; `blame()` found it from the
  graph's `explains` edges.
- **The extensibility claim (G6 / C13):** `fractionbars.compare.v1`
  (`src/games/fractionbars`) is a second mechanic, a second
  representation (`AREA_MODEL`), registered via `server/state.ts` calling
  `registry.register()` and `itemBank.register()`. `src/engine` and
  `src/store` never import it.
- **The wheel-spin claim:** `tests/engine.test.ts` and
  `tests/simulation.test.ts` drive a `wheelSpinner` profile through many
  sessions and assert escalation happens within the attempt limit, and
  that the stuck concept is never served again afterwards.
