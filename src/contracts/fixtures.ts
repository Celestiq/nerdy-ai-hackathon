/**
 * Reference fixtures for the four contracts: one valid and several invalid
 * examples of each, per roadmap.html C0 deliverables. Consumed by
 * tests/contracts.test.ts.
 */

export const validManifest = {
  game_id: "numberline.place.v2",
  assesses: {
    representations: ["NUMBER_LINE"],
    task_types: ["MAGNITUDE_PLACEMENT", "COMPARISON"],
  },
  grade_band: [2, 5],
  duration_s: { min: 180, max: 300 },
  items_per_session: { min: 8, max: 14 },
  reading_required: false,
  difficulty_range: [0.1, 0.9],
  signatures: ["LOG_COMPRESSION", "WHOLE_NUMBER_BIAS", "LONGER_IS_LARGER", "LANDMARK_ONLY"],
};

export const invalidManifests: Array<{ reason: string; value: unknown }> = [
  { reason: "grade_band inverted", value: { ...validManifest, grade_band: [5, 2] } },
  { reason: "duration_s inverted", value: { ...validManifest, duration_s: { min: 300, max: 180 } } },
  { reason: "unknown signature code", value: { ...validManifest, signatures: ["NOT_A_REAL_CODE"] } },
  { reason: "empty representations", value: { ...validManifest, assesses: { ...validManifest.assesses, representations: [] } } },
  { reason: "extra unknown field", value: { ...validManifest, mastery_estimate: 0.8 } },
  { reason: "missing game_id", value: { ...validManifest, game_id: undefined } },
];

export const validEvidenceBundle = {
  session_id: "ses_4f21",
  student_id: "stu_0093",
  assignment_id: "asg_7710",
  game_id: "numberline.place.v2",
  started_at: "2026-09-08T18:04:11Z",
  ended_at: "2026-09-08T18:08:47Z",
  observations: [
    {
      item_id: "itm_8831",
      concept_id: "F.MAG.CMP",
      difficulty: 0.42,
      response: { kind: "position", value: 0.78, target: 0.125 },
      verdict: "incorrect",
      signature: "WHOLE_NUMBER_BIAS",
      signature_confidence: 0.9,
      latency_ms: 4200,
      attempts: 1,
      flags: [],
    },
  ],
  engagement: { completed: true, abandoned_at: null, idle_ms: 0 },
};

export const invalidEvidenceBundles: Array<{ reason: string; value: unknown }> = [
  { reason: "ended before started", value: { ...validEvidenceBundle, started_at: "2026-09-08T18:08:47Z", ended_at: "2026-09-08T18:04:11Z" } },
  {
    reason: "score smuggled into response",
    value: {
      ...validEvidenceBundle,
      observations: [{ ...validEvidenceBundle.observations[0], response: { ...validEvidenceBundle.observations[0].response, score: 0.9 } }],
    },
  },
  {
    reason: "bad concept id shape",
    value: { ...validEvidenceBundle, observations: [{ ...validEvidenceBundle.observations[0], concept_id: "not_a_concept" }] },
  },
  {
    reason: "signature not in registry",
    value: { ...validEvidenceBundle, observations: [{ ...validEvidenceBundle.observations[0], signature: "MADE_UP" }] },
  },
  { reason: "missing session_id", value: { ...validEvidenceBundle, session_id: undefined } },
  {
    reason: "difficulty out of range",
    value: { ...validEvidenceBundle, observations: [{ ...validEvidenceBundle.observations[0], difficulty: 1.4 }] },
  },
];

export const validBeliefState = {
  student_id: "stu_0093",
  concept_id: "F.MAG.CMP",
  p_mastery: 0.61,
  confidence: 0.38,
  observations_n: 6,
  last_observed: "2026-08-19",
  p_decayed: 0.44,
  signatures: [
    { code: "WHOLE_NUMBER_BIAS", count: 4, strength: 0.8, last_seen: "2026-08-19", blames: ["F.MAG.UNIT"] },
  ],
  attempts_without_mastery: 3,
  status: "STUCK",
};

export const invalidBeliefStates: Array<{ reason: string; value: unknown }> = [
  { reason: "p_mastery out of range", value: { ...validBeliefState, p_mastery: 1.2 } },
  { reason: "unknown status", value: { ...validBeliefState, status: "PROBABLY_FINE" } },
  { reason: "negative observations_n", value: { ...validBeliefState, observations_n: -1 } },
  {
    reason: "signature blames a malformed concept id",
    value: { ...validBeliefState, signatures: [{ ...validBeliefState.signatures[0], blames: ["not valid"] }] },
  },
  { reason: "missing concept_id", value: { ...validBeliefState, concept_id: undefined } },
  { reason: "extra unknown field", value: { ...validBeliefState, score: 90 } },
];

export const validAssignment = {
  assignment_id: "asg_7710",
  student_id: "stu_0093",
  game_id: "numberline.place.v2",
  concepts: ["F.MAG.UNIT"],
  item_specs: [{ item_id: "itm_8831", concept_id: "F.MAG.UNIT", difficulty: 0.42, is_anchor: false }],
  time_budget_s: 300,
  created_at: "2026-09-08T18:04:11Z",
  seed: "asg_7710:stu_0093",
  decision_log: [{ concept_id: "F.MAG.UNIT", included: true, score: 0.82, reason: "frontier & unmeasured" }],
};

export const invalidAssignments: Array<{ reason: string; value: unknown }> = [
  { reason: "empty item_specs", value: { ...validAssignment, item_specs: [] } },
  { reason: "empty concepts", value: { ...validAssignment, concepts: [] } },
  { reason: "negative time budget", value: { ...validAssignment, time_budget_s: -5 } },
  {
    reason: "item_spec concept id malformed",
    value: { ...validAssignment, item_specs: [{ ...validAssignment.item_specs[0], concept_id: "nope" }] },
  },
  { reason: "missing seed", value: { ...validAssignment, seed: undefined } },
  { reason: "missing decision_log", value: { ...validAssignment, decision_log: undefined } },
];
