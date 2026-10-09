-- ============================================================
-- Provision a limited application role for the chatbot platform.
-- Run this script ONCE via the Neon console SQL editor or psql
-- connected with the neondb_owner (superuser) credentials.
--
-- After running:
--   1. Copy the app_user connection string from Neon console
--      (Roles → app_user → Connection string).
--   2. Set APP_DATABASE_URL in Vercel env vars for dunn-consulting-services.
--   3. Update lib/db/client.ts to use APP_DATABASE_URL when set (see comment
--      at the bottom of this file).
--
-- Why this matters:
--   While the app connects as neondb_owner, the owner_bypass RLS policy lets
--   it see all rows regardless of app.gym_id. Switching to app_user means
--   only rows matching the per-request app.gym_id are visible — enforcing
--   tenant isolation at the database layer even if app code has a bug.
-- ============================================================

-- ── 1. Create the limited application role ────────────────────────────────────

CREATE ROLE app_user WITH LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';

-- ── 2. Grant connection and schema usage ──────────────────────────────────────

GRANT CONNECT ON DATABASE neondb TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- ── 3. Grant DML on all tenant-scoped tables ──────────────────────────────────
--   app_user can read and write data but cannot ALTER or DROP anything.
--   RLS policies (tenant_isolation) will further restrict row visibility to
--   the current app.gym_id GUC value.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  gyms,
  gym_users,
  leads,
  chat_sessions,
  chat_messages,
  lead_status_history,
  chat_turn_metrics,
  faq_chunks
TO app_user;

-- prospects is an agency-level CRM table — app_user should NOT access it.
-- (No GRANT on prospects.)

-- ── 4. Grant sequence usage (for any serial / identity columns) ───────────────
-- The current schema uses text UUIDs for all PKs so this is a no-op, but
-- included for safety if sequences are ever added.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ── 5. Verify setup ───────────────────────────────────────────────────────────
-- After running, check that:
--   a) app_user can connect to the database.
--   b) app_user cannot see any rows without setting app.gym_id (RLS blocks).
--   c) Setting app.gym_id='demo-gym' exposes only demo-gym rows.
--   d) app_user cannot SELECT from prospects.

-- Test commands (run as app_user):
--
--   SET app.gym_id = 'demo-gym';
--   SELECT count(*) FROM leads;           -- should return demo-gym count only
--   RESET app.gym_id;
--   SELECT count(*) FROM leads;           -- should return 0 (no GUC → no match)
--   SELECT count(*) FROM prospects;       -- should ERROR: permission denied

-- ── 6. Future: update lib/db/client.ts ───────────────────────────────────────
-- In createPostgresDb(), prefer APP_DATABASE_URL over DATABASE_URL:
--
--   const databaseUrl = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
--
-- Keep DATABASE_URL (neondb_owner) as the migration URL and for admin/cron
-- connections. Add APP_DATABASE_URL to Vercel env vars for the app_user role.
--
-- The withTenantContext() helper in lib/db/tenant-db.ts already sets
-- app.gym_id before each query — no other code changes are required.
