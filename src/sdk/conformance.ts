import { EvidenceBundleSchema } from "../contracts/schemas.js";
import type { CapabilityManifest } from "../contracts/schemas.js";

export interface ConformanceResult {
  passed: boolean;
  failures: string[];
}

/**
 * Any game must pass this before it can register. See roadmap.html C7
 * "Conformance suite" tests. Run it against a candidate Evidence Bundle
 * plus the manifest the game registered.
 */
export function runConformanceSuite(candidate: unknown, manifest: CapabilityManifest): ConformanceResult {
  const failures: string[] = [];

  const parsed = EvidenceBundleSchema.safeParse(candidate);
  if (!parsed.success) {
    failures.push(...parsed.error.issues.map((i) => `schema: ${i.path.join(".")}: ${i.message}`));
    return { passed: false, failures };
  }
  const bundle = parsed.data;

  if (bundle.game_id !== manifest.game_id) {
    failures.push(`game_id "${bundle.game_id}" does not match registered manifest "${manifest.game_id}"`);
  }

  for (const obs of bundle.observations) {
    if (obs.signature !== "UNCLASSIFIED" && !manifest.signatures.includes(obs.signature)) {
      failures.push(`observation ${obs.item_id} emits signature "${obs.signature}" not declared in this game's manifest`);
    }
  }

  const n = bundle.observations.length;
  if (bundle.engagement.completed && (n < manifest.items_per_session.min || n > manifest.items_per_session.max)) {
    failures.push(
      `completed session produced ${n} observations, outside manifest bounds [${manifest.items_per_session.min}, ${manifest.items_per_session.max}]`,
    );
  }

  return { passed: failures.length === 0, failures };
}
