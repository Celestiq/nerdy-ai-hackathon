/**
 * CLI harness runner -- see roadmap.html C1 "Done when: a thousand-session
 * run completes, produces a diffable trace, and flags a planted routing
 * bug." This drives all six learner profiles through a mixed cohort
 * against the real engine and store (no server, no games), and prints a
 * compact trace plus a routing self-check.
 *
 * Usage: npm run simulate -- [rounds] [seed]
 */
import { ConceptGraph } from "../src/graph/loader.js";
import { GameRegistry, ItemBankRegistry } from "../src/registry/index.js";
import type { ConceptMetaLookup } from "../src/store/projector.js";
import { numberlineManifest, numberlineItems } from "../src/games/numberline/index.js";
import { fractionbarsManifest, fractionbarsItems, partitionItems } from "../src/games/fractionbars/index.js";
import { runCohort, detectRoutingFailure } from "../src/simulation/cohortRunner.js";
import { competent, misconceptionHolder, wheelSpinner, rapidGuesser, abandoner, decayer } from "../src/simulation/profiles.js";

const rounds = Number(process.argv[2] ?? 40);
const seed = process.argv[3] ?? `cli-run-${Date.now()}`;

const graph = ConceptGraph.load();
const metaOf: ConceptMetaLookup = (id) => {
  const n = graph.node(id);
  return n && { mastery_threshold: n.mastery_threshold, decay_half_life_days: n.decay_half_life_days };
};

const registry = new GameRegistry();
registry.register(numberlineManifest);
registry.register(fractionbarsManifest);

const itemBank = new ItemBankRegistry();
itemBank.register(numberlineManifest.game_id, (concepts) =>
  numberlineItems.filter((i) => concepts.includes(i.concept_id)).map((i) => ({ item_id: i.item_id, concept_id: i.concept_id, difficulty: i.difficulty })),
);
itemBank.register(fractionbarsManifest.game_id, (concepts) =>
  [...fractionbarsItems.filter((i) => concepts.includes(i.concept_id)), ...partitionItems.filter((i) => concepts.includes(i.concept_id))].map((i) => ({
    item_id: i.item_id,
    concept_id: i.concept_id,
    difficulty: i.difficulty,
  })),
);

const students = [
  { id: "sim_competent", profile: competent },
  { id: "sim_wnb", profile: misconceptionHolder("WHOLE_NUMBER_BIAS") },
  { id: "sim_denombias", profile: misconceptionHolder("DENOMINATOR_BIAS") },
  { id: "sim_wheelspinner", profile: wheelSpinner },
  { id: "sim_guesser", profile: rapidGuesser },
  { id: "sim_abandoner", profile: abandoner },
  { id: "sim_decayer", profile: decayer },
];

console.log(`Running ${rounds} rounds x ${students.length} students, seed="${seed}"...\n`);

const { store, trace } = runCohort({ graph, registry, itemBank, metaOf, students, rounds, seed });

console.log(`${trace.length} session attempts recorded.\n`);

for (const s of students) {
  const belief = store.belief(s.id);
  const statuses = [...belief.values()].map((b) => b.status);
  const counts = statuses.reduce<Record<string, number>>((acc, st) => ((acc[st] = (acc[st] ?? 0) + 1), acc), {});
  console.log(`${s.id.padEnd(20)} concepts touched: ${belief.size.toString().padStart(2)}  ${JSON.stringify(counts)}`);

  const failure = detectRoutingFailure(trace, s.id);
  if (failure) console.log(`  ROUTING FAILURE: ${failure}`);
}

console.log("\nLast 5 trace entries:");
for (const t of trace.slice(-5)) {
  console.log(`  [${t.round}] ${t.student_id.padEnd(20)} ${t.concepts.join(",") || `(blocked: ${t.blocked_reason})`}`);
}

const anyFailures = students.some((s) => detectRoutingFailure(trace, s.id) !== null);
process.exit(anyFailures ? 1 : 0);
