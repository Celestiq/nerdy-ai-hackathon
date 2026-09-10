import { describe, it, expect } from "vitest";
import { graph, registry, itemBank, anchors } from "../server/state.js";
import { assembleAssignment } from "../src/engine/assemble.js";

/**
 * Regression guard for the registration-order decision in server/state.ts:
 * balancescaleManifest is registered BEFORE fractionbarsManifest so it wins
 * the games[0] solo-concept tie for F.EQV (the only concept both manifests
 * capability-match today) without affecting any other concept. This is
 * exactly the "looked fixed, wasn't guarded" gap class BACKLOG.md's
 * "Balance Scale" item calls out -- a future accidental registration
 * reorder, or a new game claiming F.EQV's representation ahead of this one,
 * should fail this test, not just a manual live-check.
 *
 * Exercises the real production registry/itemBank/graph wiring from
 * server/state.ts (not a synthetic test-only registry, unlike
 * tests/registry.test.ts's manifests), same discipline tests/routes.test.ts
 * already uses for this file.
 */
describe("Balance Scale registration order", () => {
  it("resolves F.EQV to balancescale.compare.v1, not fractionbars.compare.v1", () => {
    const result = assembleAssignment(graph, registry, itemBank, ["F.EQV"], anchors);
    expect(result).toBeDefined();
    expect(result!.game_id).toBe("balancescale.compare.v1");
    expect(result!.item_specs.length).toBeGreaterThan(0);
  });

  it("leaves F.MAG.CMP, G.PART, and F.NOTATE resolving to their existing games, unaffected", () => {
    // F.MAG.CMP: NUMBER_LINE/AREA_MODEL + COMPARISON -- balancescale never
    // capability-matches it (BALANCE_SCALE + EQUIVALENCE only).
    const cmp = assembleAssignment(graph, registry, itemBank, ["F.MAG.CMP"], anchors);
    expect(cmp).toBeDefined();
    expect(cmp!.game_id).toBe("numberline.place.v2");

    // G.PART: AREA_MODEL + PARTITION -- balancescale doesn't declare
    // PARTITION as a task type, so it never enters this concept's match set.
    const part = assembleAssignment(graph, registry, itemBank, ["G.PART"], anchors);
    expect(part).toBeDefined();
    expect(part!.game_id).toBe("fractionbars.compare.v1");

    // F.NOTATE: AREA_MODEL + PARTITION -- same reasoning as G.PART.
    const notate = assembleAssignment(graph, registry, itemBank, ["F.NOTATE"], anchors);
    expect(notate).toBeDefined();
    expect(notate!.game_id).toBe("fractionbars.compare.v1");
  });

  it("registers balancescale.compare.v1 as the sole capability match for F.EQV", () => {
    const matches = registry.matchConcept(graph, "F.EQV").map((m) => m.game_id);
    expect(matches[0]).toBe("balancescale.compare.v1");
    expect(matches).toContain("fractionbars.compare.v1"); // still capability-matches, just not games[0]
  });
});
