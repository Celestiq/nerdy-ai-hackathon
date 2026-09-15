-- nerdy-ai production datastore (Postgres / Supabase)
--
-- Mirrors the append-only evidence log described in docs/architecture.html
-- #store: one row per submitted EvidenceBundle, insert-only, deduped by
-- session_id. Belief is still computed in the app (src/store/projector.ts)
-- as a pure projection over these rows -- this table has no "mastery"
-- column and never will; it is the durable log, not a model.
--
-- Run this once against your Supabase project (SQL Editor, or `psql
-- "$DATABASE_URL" -f db/schema.sql`) before setting DATABASE_URL and
-- starting the server. Safe to re-run (every statement is idempotent).

create table if not exists evidence_bundles (
  session_id text primary key,
  student_id text not null,
  game_id text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  -- Full EvidenceBundle (schema: src/contracts/schemas.ts), stored verbatim.
  -- The columns above are denormalized out of this payload purely so the
  -- table is queryable/indexable from the Supabase dashboard without
  -- parsing JSON by hand; the app itself only ever reads `payload` back.
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists evidence_bundles_student_id_idx
  on evidence_bundles (student_id);

create index if not exists evidence_bundles_started_at_idx
  on evidence_bundles (started_at);
