-- Enforce Row-Level Security and add gyms table isolation.
--
-- What this migration does:
--   1. FORCE ROW LEVEL SECURITY on all 7 tenant tables — the table owner
--      (neondb_owner) is now also subject to RLS policies instead of bypassing
--      them automatically.
--   2. Adds an "owner_bypass" policy on each table so the owner role retains
--      full cross-tenant access for admin dashboards and cron jobs. Permissive
--      policies are OR'd together: a row is visible if ANY policy matches, so
--      owner_bypass lets the owner through regardless of app.gym_id.
--   3. Enables and enforces RLS on the "gyms" config table (was missing before).
--
-- Current enforcement status:
--   While the app connects as neondb_owner, "owner_bypass" makes this migration
--   non-breaking but also non-restricting for that role. The real enforcement
--   kicks in once you provision a limited "app_user" role (no owner_bypass) and
--   point DATABASE_URL at it — see scripts/provision-app-role.sql.
--
-- GUC per-request:
--   Per-tenant routes must set the transaction-local GUC before running queries:
--     SELECT set_config('app.gym_id', $gymId, true)   -- local=true → txn-scoped
--   The withTenantContext() helper in lib/db/tenant-db.ts does this automatically.
--
-- NOTE: 'neondb_owner' is the default Neon database owner role. If you migrate
--   to another host, replace it with the appropriate owner role name.

-- ── 1. FORCE RLS on the 7 tables that already have tenant_isolation policies ──

ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chat_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chat_messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lead_status_history" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chat_turn_metrics" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "gym_users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "faq_chunks" FORCE ROW LEVEL SECURITY;

-- ── 2. Owner bypass policies (permissive, OR'd with tenant_isolation) ─────────

CREATE POLICY "owner_bypass" ON "leads"
  AS PERMISSIVE FOR ALL TO neondb_owner
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "owner_bypass" ON "chat_sessions"
  AS PERMISSIVE FOR ALL TO neondb_owner
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "owner_bypass" ON "chat_messages"
  AS PERMISSIVE FOR ALL TO neondb_owner
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "owner_bypass" ON "lead_status_history"
  AS PERMISSIVE FOR ALL TO neondb_owner
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "owner_bypass" ON "chat_turn_metrics"
  AS PERMISSIVE FOR ALL TO neondb_owner
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "owner_bypass" ON "gym_users"
  AS PERMISSIVE FOR ALL TO neondb_owner
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "owner_bypass" ON "faq_chunks"
  AS PERMISSIVE FOR ALL TO neondb_owner
  USING (true) WITH CHECK (true);

-- ── 3. RLS on the gyms config table (was previously unprotected) ──────────────

ALTER TABLE "gyms" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "gyms" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Non-owner roles with app.gym_id set can read/write only their own gym row.
CREATE POLICY "tenant_isolation" ON "gyms"
  USING ("id" = current_setting('app.gym_id', true))
  WITH CHECK ("id" = current_setting('app.gym_id', true));
--> statement-breakpoint

-- Owner retains full access (listing all tenants, admin dashboard, cron).
CREATE POLICY "owner_bypass" ON "gyms"
  AS PERMISSIVE FOR ALL TO neondb_owner
  USING (true) WITH CHECK (true);
