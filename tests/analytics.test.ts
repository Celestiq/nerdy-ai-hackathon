import { describe, it, expect } from "vitest";
import { ConceptGraph } from "../src/graph/loader.js";
import { buildTutorReport, type CohortMember } from "../src/analytics/analytics.js";
import type { BeliefInternal } from "../src/store/types.js";

const graph = ConceptGraph.load();

function belief(overrides: Partial<BeliefInternal>): BeliefInternal {
  return {
    student_id: "stu_x",
    concept_id: "F.MAG.CMP",
    p_mastery: 0.5,
    confidence: 0.6,
    observations_n: 5,
    last_observed: "2026-01-01",
    p_decayed: 0.5,
    signatures: [],
    attempts_without_mastery: 0,
    status: "EMERGING",
    ...overrides,
  };
}

describe("unmeasured-vs-weak misrepresentation guard", () => {
  it("a cohort where everyone is simply unmeasured never claims weakness", () => {
    const members: CohortMember[] = [
      { student_id: "a", name: "A", belief: new Map() },
      { student_id: "b", name: "B", belief: new Map() },
      { student_id: "c", name: "C", belief: new Map() },
    ];
    const report = buildTutorReport(graph, "coh", members);
    const cmpRow = report.coverage.find((r) => r.concept_id === "F.MAG.CMP")!;
    expect(cmpRow.weak_n).toBe(0);
    expect(cmpRow.unmeasured_n).toBe(3);
    expect(report.clusters).toEqual([]);
  });

  it("low-confidence findings are withheld outright, not shown faintly", () => {
    const members: CohortMember[] = [
      {
        student_id: "a",
        name: "A",
        belief: new Map([
          [
            "F.MAG.CMP",
            belief({
              student_id: "a",
              confidence: 0.1, // below threshold
              p_mastery: 0.2,
              signatures: [{ code: "WHOLE_NUMBER_BIAS", count: 1, strength: 0.3, last_seen: "2026-01-01" }],
            }),
          ],
        ]),
      },
    ];
    const report = buildTutorReport(graph, "coh", members);
    expect(report.clusters).toEqual([]);
    const cmpRow = report.coverage.find((r) => r.concept_id === "F.MAG.CMP")!;
    expect(cmpRow.weak_n).toBe(0); // measured, but not confidently -- must not count as weak either
  });
});

describe("clustering", () => {
  it("groups children sharing a signature and attributes the blamed root cause", () => {
    const shared = { code: "WHOLE_NUMBER_BIAS", count: 3, strength: 0.9, last_seen: "2026-01-01" };
    const members: CohortMember[] = [
      { student_id: "a", name: "A", belief: new Map([["F.MAG.CMP", belief({ student_id: "a", confidence: 0.6, signatures: [shared] })]]) },
      { student_id: "b", name: "B", belief: new Map([["F.MAG.CMP", belief({ student_id: "b", confidence: 0.6, signatures: [shared] })]]) },
      { student_id: "c", name: "C", belief: new Map([["F.MAG.CMP", belief({ student_id: "c", confidence: 0.6, p_mastery: 0.95, signatures: [] })]]) },
    ];
    const report = buildTutorReport(graph, "coh", members);
    expect(report.clusters).toHaveLength(1);
    expect(report.clusters[0].student_ids.sort()).toEqual(["a", "b"]);
    expect(report.clusters[0].root_cause).toBe("F.MAG.UNIT");
    expect(report.opening_move?.based_on).toContain("cluster:");
  });

  it("does not form a cluster from a single child's isolated miss", () => {
    const members: CohortMember[] = [
      { student_id: "a", name: "A", belief: new Map([["F.MAG.CMP", belief({ student_id: "a", confidence: 0.6, signatures: [{ code: "WHOLE_NUMBER_BIAS", count: 1, strength: 0.3, last_seen: "2026-01-01" }] })]]) },
    ];
    const report = buildTutorReport(graph, "coh", members);
    expect(report.clusters).toEqual([]);
  });
});

describe("stuck and retention", () => {
  it("surfaces a stuck child in the needs-a-human list", () => {
    const members: CohortMember[] = [
      { student_id: "a", name: "A", belief: new Map([["F.MAG.CMP", belief({ student_id: "a", attempts_without_mastery: 3, status: "STUCK" })]]) },
    ];
    const report = buildTutorReport(graph, "coh", members);
    expect(report.stuck).toHaveLength(1);
    expect(report.stuck[0].student_id).toBe("a");
  });

  it("surfaces a confident retention alert but not a low-confidence one", () => {
    const members: CohortMember[] = [
      { student_id: "a", name: "A", belief: new Map([["N.MAG", belief({ student_id: "a", status: "DECAYED", confidence: 0.6 })]]) },
      { student_id: "b", name: "B", belief: new Map([["N.MAG", belief({ student_id: "b", status: "DECAYED", confidence: 0.1 })]]) },
    ];
    const report = buildTutorReport(graph, "coh", members);
    expect(report.retention.map((r) => r.student_id)).toEqual(["a"]);
  });
});
