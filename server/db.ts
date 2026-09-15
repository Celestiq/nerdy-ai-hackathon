import postgres from "postgres";
import type { EvidenceBundle } from "../src/contracts/schemas.js";

/**
 * Optional durability layer over the in-memory LearnerStore (src/store).
 * Deliberately additive, not a replacement: LearnerStore/EvidenceLog stay
 * exactly as documented in architecture.html #store (append-only, pure
 * projection, in-memory + optional local file) so the engine, simulation
 * harness, and every existing test keep working unchanged whether or not a
 * database is configured. When DATABASE_URL is set, the server also mirrors
 * every accepted evidence bundle into Postgres (see db/schema.sql) and
 * replays it back at boot -- so history survives a restart/redeploy even
 * though the process's local disk does not.
 *
 * Not built: multi-instance consistency (a second server replica would need
 * its own boot-time replay and wouldn't see another replica's writes until
 * restarted). Out of scope for a single-instance hackathon deploy; revisit
 * if this ever runs as more than one replica.
 */

const connectionString = process.env.DATABASE_URL;

// Supabase's pooled connection (port 6543, "Transaction" mode) multiplexes
// connections across clients and doesn't support server-side prepared
// statements -- `prepare: false` is required for that pooler and harmless
// against a direct connection (port 5432) too. ssl:"prefer" negotiates TLS
// whenever the server offers it (Supabase always does) without hard-failing
// against a plain local Postgres that doesn't (e.g. `npm run seed` against a
// throwaway local instance while developing this module).
const sql = connectionString ? postgres(connectionString, { ssl: "prefer", prepare: false, max: 5 }) : null;

export function isDbConfigured(): boolean {
  return sql !== null;
}

export async function checkDbConnection(): Promise<boolean> {
  if (!sql) return false;
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  }
}

/** Boot-time hydration: every bundle ever persisted, oldest first. */
export async function loadAllBundles(): Promise<EvidenceBundle[]> {
  if (!sql) return [];
  const rows = await sql<{ payload: EvidenceBundle }[]>`
    select payload from evidence_bundles order by started_at asc
  `;
  return rows.map((r) => r.payload);
}

/**
 * Durably persists one bundle. Call only after LearnerStore.ingest() has
 * already accepted it in memory -- this is the write-through half, not the
 * source of truth for the running process. Idempotent on session_id, same
 * as the in-memory log.
 */
export async function persistBundle(bundle: EvidenceBundle): Promise<void> {
  if (!sql) return;
  await sql`
    insert into evidence_bundles (session_id, student_id, game_id, started_at, ended_at, payload)
    values (${bundle.session_id}, ${bundle.student_id}, ${bundle.game_id}, ${bundle.started_at}, ${bundle.ended_at}, ${sql.json(bundle)})
    on conflict (session_id) do nothing
  `;
}

/**
 * Closes the connection pool. The long-running server never calls this (it
 * holds the pool for its whole lifetime) -- this is for short-lived
 * one-shot scripts (scripts/seed.ts) that need Node to actually exit
 * instead of hanging on the pool's open sockets after their work is done.
 */
export async function closeDb(): Promise<void> {
  if (sql) await sql.end();
}
