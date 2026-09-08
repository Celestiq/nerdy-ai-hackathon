import { z } from "zod";
import { SIGNATURE_CODES } from "./signatures.js";
import { isConceptId } from "./concepts.js";

/**
 * The four contracts. See docs/architecture.html #contracts.
 * These are the ONLY shapes allowed to cross a module boundary in this
 * codebase. Every service validates at its edge with these schemas.
 */

const ConceptId = z.string().refine(isConceptId, {
  message: "not a legal concept id (expected STRAND.SUB.TOKEN, upper snake, 2-4 segments)",
});

const SignatureCode = z.enum(SIGNATURE_CODES);

const RepresentationEnum = z.enum([
  "NUMBER_LINE",
  "AREA_MODEL",
  "SET_MODEL",
  "BALANCE_SCALE",
  "ARRAY",
]);

const TaskTypeEnum = z.enum([
  "MAGNITUDE_PLACEMENT",
  "COMPARISON",
  "EQUIVALENCE",
  "PARTITION",
  "ORDERING",
]);

// ---------------------------------------------------------------------------
// A - Capability Manifest (Game -> Registry)
// ---------------------------------------------------------------------------

export const CapabilityManifestSchema = z
  .object({
    game_id: z.string().min(3),
    assesses: z.object({
      representations: z.array(RepresentationEnum).min(1),
      task_types: z.array(TaskTypeEnum).min(1),
    }),
    grade_band: z.tuple([z.number().int().min(0).max(5), z.number().int().min(0).max(5)]),
    duration_s: z.object({ min: z.number().positive(), max: z.number().positive() }),
    items_per_session: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }),
    reading_required: z.boolean(),
    difficulty_range: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
    signatures: z.array(SignatureCode).min(1),
  })
  .strict()
  .refine((m) => m.grade_band[0] <= m.grade_band[1], { message: "grade_band must be ordered" })
  .refine((m) => m.duration_s.min <= m.duration_s.max, { message: "duration_s must be ordered" })
  .refine((m) => m.difficulty_range[0] <= m.difficulty_range[1], { message: "difficulty_range must be ordered" });

export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>;

// ---------------------------------------------------------------------------
// B - Evidence Bundle (Game -> Store)
// ---------------------------------------------------------------------------

const ObservationResponseSchema = z
  .object({
    kind: z.string().min(1),
    value: z.union([z.number(), z.string(), z.boolean()]),
    target: z.union([z.number(), z.string(), z.boolean()]).optional(),
  })
  .strict();

export const ObservationSchema = z
  .object({
    item_id: z.string().min(1),
    concept_id: ConceptId,
    difficulty: z.number().min(0).max(1),
    response: ObservationResponseSchema,
    verdict: z.enum(["correct", "incorrect"]),
    signature: SignatureCode,
    signature_confidence: z.number().min(0).max(1),
    latency_ms: z.number().int().nonnegative(),
    attempts: z.number().int().positive(),
    flags: z.array(z.enum(["rapid_guess", "idle", "retry_spam"])),
  })
  .strict()
  // Forbidden-in-evidence guard: never let a game smuggle a verdict-adjacent
  // judgement field through the response payload.
  .refine(
    (o) => !("score" in o.response) && !("mastery" in o.response) && !("percent" in o.response),
    { message: "evidence must never carry a score, mastery estimate, or percentage" },
  );

export type Observation = z.infer<typeof ObservationSchema>;

export const EvidenceBundleSchema = z
  .object({
    session_id: z.string().min(1),
    student_id: z.string().min(1),
    assignment_id: z.string().min(1),
    game_id: z.string().min(1),
    started_at: z.string().datetime(),
    ended_at: z.string().datetime(),
    observations: z.array(ObservationSchema),
    engagement: z
      .object({
        completed: z.boolean(),
        abandoned_at: z.string().datetime().nullable(),
        idle_ms: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .refine((b) => new Date(b.ended_at).getTime() >= new Date(b.started_at).getTime(), {
    message: "ended_at must not precede started_at",
  });

export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

// ---------------------------------------------------------------------------
// C - Belief State (Store -> Engine, Store -> Tutor View)
// ---------------------------------------------------------------------------

export const BeliefStatusEnum = z.enum(["UNTESTED", "EMERGING", "MASTERED", "DECAYED", "STUCK"]);

export const SignatureRecordSchema = z
  .object({
    code: SignatureCode,
    count: z.number().int().nonnegative(),
    strength: z.number().min(0).max(1),
    last_seen: z.string(),
    blames: z.array(ConceptId), // filled in at the composition layer; store's own copy may be []
  })
  .strict();

export type SignatureRecord = z.infer<typeof SignatureRecordSchema>;

export const BeliefStateSchema = z
  .object({
    student_id: z.string().min(1),
    concept_id: ConceptId,
    p_mastery: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    observations_n: z.number().int().nonnegative(),
    last_observed: z.string().nullable(),
    p_decayed: z.number().min(0).max(1),
    signatures: z.array(SignatureRecordSchema),
    attempts_without_mastery: z.number().int().nonnegative(),
    status: BeliefStatusEnum,
  })
  .strict();

export type BeliefState = z.infer<typeof BeliefStateSchema>;

// ---------------------------------------------------------------------------
// D - Assignment (Engine -> Client)
// ---------------------------------------------------------------------------

export const ItemSpecSchema = z
  .object({
    item_id: z.string().min(1),
    concept_id: ConceptId,
    difficulty: z.number().min(0).max(1),
    is_anchor: z.boolean(),
  })
  .strict();

export type ItemSpec = z.infer<typeof ItemSpecSchema>;

export const DecisionLogEntrySchema = z
  .object({
    concept_id: ConceptId,
    included: z.boolean(),
    score: z.number(),
    reason: z.string(),
  })
  .strict();

export const AssignmentSchema = z
  .object({
    assignment_id: z.string().min(1),
    student_id: z.string().min(1),
    game_id: z.string().min(1),
    concepts: z.array(ConceptId).min(1),
    item_specs: z.array(ItemSpecSchema).min(1),
    time_budget_s: z.number().positive(),
    created_at: z.string().datetime(),
    seed: z.string(),
    decision_log: z.array(DecisionLogEntrySchema),
  })
  .strict();

export type Assignment = z.infer<typeof AssignmentSchema>;

// ---------------------------------------------------------------------------
// Escalation -- not one of the four contracts, but a designed system output
// (the "Needs a human" branch out of the engine). Kept alongside the
// contracts because both Engine and Analytics read/write it.
// ---------------------------------------------------------------------------

export const EscalationSchema = z
  .object({
    student_id: z.string().min(1),
    concept_id: ConceptId,
    attempts_without_mastery: z.number().int(),
    escalated_at: z.string().datetime(),
  })
  .strict();

export type Escalation = z.infer<typeof EscalationSchema>;
