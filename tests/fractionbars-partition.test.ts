import { describe, it, expect } from "vitest";
import { itemBank } from "../server/state.js";
import { fractionbarsManifest, partitionItems, classifyPartition, notateDistractor } from "../src/games/fractionbars/index.js";

/**
 * Cycle 18 C3: partition items for G.PART, G.PART.UNEQUAL and F.NOTATE used
 * to share `partition:${parts}` content keys, so the engine's within-session
 * dedupe (src/engine/assemble.ts) treated e.g. an F.NOTATE thirds item and a
 * G.PART thirds item as the same picture and dropped one.
 */
describe("partition content keys", () => {
  it("never collide across G.PART / G.PART.UNEQUAL / F.NOTATE items that show different pictures", () => {
    const entries = itemBank.itemsForConcepts(fractionbarsManifest.game_id, ["G.PART", "G.PART.UNEQUAL", "F.NOTATE"]);
    expect(entries.length).toBe(partitionItems.length);
    const byKey = new Map<string, string[]>();
    for (const e of entries) byKey.set(e.content_key!, [...(byKey.get(e.content_key!) ?? []), e.item_id]);
    const collisions = [...byKey.entries()].filter(([, ids]) => ids.length > 1);
    expect(collisions).toEqual([]);
  });
});

describe("classifyPartition on the C3 variants", () => {
  const byId = (id: string) => partitionItems.find((i) => i.item_id === id)!;
  const wrong = (c: "a" | "b") => (c === "a" ? "b" : "a");

  it("F.NOTATE (shaded): correct pick is correct, the complement picture is UNCLASSIFIED", () => {
    const item = byId("itm_fno_5_6");
    expect(item.distractor).toBe("complement");
    expect(classifyPartition(item, item.correct)).toEqual({ verdict: "correct", signature: "UNCLASSIFIED", signature_confidence: 0 });
    expect(classifyPartition(item, wrong(item.correct))).toMatchObject({ verdict: "incorrect", signature: "UNCLASSIFIED" });
  });

  it("G.PART.UNEQUAL offset cut: picking the unequal picture is UNCLASSIFIED", () => {
    const item = byId("itm_gpu_thirds_offset");
    expect(item.unequalStyle).toBe("offset");
    expect(classifyPartition(item, item.correct).verdict).toBe("correct");
    expect(classifyPartition(item, wrong(item.correct))).toMatchObject({ verdict: "incorrect", signature: "UNCLASSIFIED" });
  });

  it("G.PART.UNEQUAL uneven strips: picking the unequal picture is UNCLASSIFIED", () => {
    const item = byId("itm_gpu_fourths_strips");
    expect(item.unequalStyle).toBe("strips");
    expect(classifyPartition(item, item.correct).verdict).toBe("correct");
    expect(classifyPartition(item, wrong(item.correct))).toMatchObject({ verdict: "incorrect", signature: "UNCLASSIFIED" });
  });

  it("F.NOTATE part-to-part distractor: same shaded count, different part count; wrong pick is UNCLASSIFIED", () => {
    const item = byId("itm_fno_1_4");
    expect(item.distractor).toBe("partpart");
    const wrongPic = notateDistractor(item)!;
    expect(wrongPic.shaded).toBe(item.shaded);
    expect(wrongPic.parts).not.toBe(item.parts);
    expect(wrongPic.parts).toBeLessThanOrEqual(8);
    expect(classifyPartition(item, wrong(item.correct))).toMatchObject({ verdict: "incorrect", signature: "UNCLASSIFIED" });
  });
});
