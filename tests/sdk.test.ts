import { describe, it, expect } from "vitest";
import { buildObservation } from "../src/sdk/observation.js";
import { runConformanceSuite } from "../src/sdk/conformance.js";
import { numberlineManifest } from "../src/games/numberline/index.js";
import { validEvidenceBundle } from "../src/contracts/fixtures.js";

describe("buildObservation", () => {
  it("flags rapid guesses and idling from measured latency, not from what the caller claims", () => {
    const fast = buildObservation({
      item_id: "i1", concept_id: "N.MAG", difficulty: 0.5, response: { kind: "t", value: 1 },
      verdict: "correct", signature: "UNCLASSIFIED", signature_confidence: 0,
      startedAtMs: 0, endedAtMs: 300, attempts: 1,
    });
    expect(fast.flags).toContain("rapid_guess");

    const slow = buildObservation({
      item_id: "i2", concept_id: "N.MAG", difficulty: 0.5, response: { kind: "t", value: 1 },
      verdict: "correct", signature: "UNCLASSIFIED", signature_confidence: 0,
      startedAtMs: 0, endedAtMs: 40_000, attempts: 1,
    });
    expect(slow.flags).toContain("idle");
  });
});

describe("conformance suite", () => {
  it("passes a well-formed bundle from the registered manifest's own game", () => {
    const obs = validEvidenceBundle.observations[0];
    const bundle = {
      ...validEvidenceBundle,
      game_id: numberlineManifest.game_id,
      observations: [obs, { ...obs, item_id: "itm_2" }, { ...obs, item_id: "itm_3" }, { ...obs, item_id: "itm_4" }],
    };
    const result = runConformanceSuite(bundle, numberlineManifest);
    expect(result.passed).toBe(true);
  });

  it("rejects a bundle whose game_id does not match the manifest it registered", () => {
    const bundle = { ...validEvidenceBundle, game_id: "some.other.game.v1" };
    const result = runConformanceSuite(bundle, numberlineManifest);
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes("game_id"))).toBe(true);
  });

  it("rejects an observation whose signature isn't declared in this game's own manifest", () => {
    const bundle = {
      ...validEvidenceBundle,
      game_id: numberlineManifest.game_id,
      observations: [{ ...validEvidenceBundle.observations[0], signature: "DENOMINATOR_BIAS" }],
    };
    const result = runConformanceSuite(bundle, numberlineManifest);
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes("not declared"))).toBe(true);
  });

  it("rejects a bundle carrying a score or mastery estimate in the response payload (schema-level guard)", () => {
    const bundle = {
      ...validEvidenceBundle,
      game_id: numberlineManifest.game_id,
      observations: [{ ...validEvidenceBundle.observations[0], response: { ...validEvidenceBundle.observations[0].response, score: 0.99 } }],
    };
    const result = runConformanceSuite(bundle, numberlineManifest);
    expect(result.passed).toBe(false);
  });
});
