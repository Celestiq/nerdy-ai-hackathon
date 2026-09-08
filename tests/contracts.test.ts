import { describe, it, expect } from "vitest";
import {
  CapabilityManifestSchema,
  EvidenceBundleSchema,
  BeliefStateSchema,
  AssignmentSchema,
} from "../src/contracts/schemas.js";
import {
  validManifest,
  invalidManifests,
  validEvidenceBundle,
  invalidEvidenceBundles,
  validBeliefState,
  invalidBeliefStates,
  validAssignment,
  invalidAssignments,
} from "../src/contracts/fixtures.js";
import { isConceptId } from "../src/contracts/concepts.js";
import { isSignatureCode } from "../src/contracts/signatures.js";

describe("Capability Manifest contract", () => {
  it("accepts the valid fixture and round-trips it unchanged", () => {
    const parsed = CapabilityManifestSchema.parse(validManifest);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(validManifest);
  });
  for (const { reason, value } of invalidManifests) {
    it(`rejects: ${reason}`, () => {
      expect(CapabilityManifestSchema.safeParse(value).success).toBe(false);
    });
  }
});

describe("Evidence Bundle contract", () => {
  it("accepts the valid fixture and round-trips it unchanged", () => {
    const parsed = EvidenceBundleSchema.parse(validEvidenceBundle);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(validEvidenceBundle);
  });
  for (const { reason, value } of invalidEvidenceBundles) {
    it(`rejects: ${reason}`, () => {
      expect(EvidenceBundleSchema.safeParse(value).success).toBe(false);
    });
  }
});

describe("Belief State contract", () => {
  it("accepts the valid fixture and round-trips it unchanged", () => {
    const parsed = BeliefStateSchema.parse(validBeliefState);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(validBeliefState);
  });
  for (const { reason, value } of invalidBeliefStates) {
    it(`rejects: ${reason}`, () => {
      expect(BeliefStateSchema.safeParse(value).success).toBe(false);
    });
  }
});

describe("Assignment contract", () => {
  it("accepts the valid fixture and round-trips it unchanged", () => {
    const parsed = AssignmentSchema.parse(validAssignment);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(validAssignment);
  });
  for (const { reason, value } of invalidAssignments) {
    it(`rejects: ${reason}`, () => {
      expect(AssignmentSchema.safeParse(value).success).toBe(false);
    });
  }
});

describe("vocabularies", () => {
  it("accepts well-formed concept ids and rejects malformed ones", () => {
    expect(isConceptId("F.MAG.UNIT")).toBe(true);
    expect(isConceptId("N.ORD")).toBe(true);
    expect(isConceptId("not_a_concept")).toBe(false);
    expect(isConceptId("lowercase.id")).toBe(false);
    expect(isConceptId("SINGLE")).toBe(false);
  });

  it("is a closed enumeration of signature codes", () => {
    expect(isSignatureCode("WHOLE_NUMBER_BIAS")).toBe(true);
    expect(isSignatureCode("UNCLASSIFIED")).toBe(true);
    expect(isSignatureCode("MADE_UP_CODE")).toBe(false);
  });
});
