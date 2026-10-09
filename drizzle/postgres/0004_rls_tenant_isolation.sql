-- Row-Level Security: database-enforced tenant isolation (defense in depth).
--
-- Each policy matches rows to the per-request GUC `app.gym_id`, set by the app
-- inside a transaction via `select set_config('app.gym_id', $gymId, true)`.
--
-- IMPORTANT — current state vs. enforcement:
--   The app connects as the table OWNER, and Postgres table owners BYPASS RLS
--   unless FORCE is enabled. Enabling RLS here is therefore NON-BREAKING: the
--   policies are version-controlled and ready, but isolation is not yet
--   enforced for the owner connection.
--
-- To ENFORCE (future activation, no schema rework needed):
--   1) Create a dedicated non-owner application role and GRANT it DML on these
--      tables (CONNECT/USAGE as needed).
--   2) Point the app's DATABASE_URL at that role.
--   3) Wrap each request's queries in a transaction that runs
--      `select set_config('app.gym_id', $gymId, true)` first.
--   Optionally `ALTER TABLE ... FORCE ROW LEVEL SECURITY` to subject the owner
--   too. A non-owner role is automatically subject to the policies.

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "leads" USING ("gym_id" = current_setting('app.gym_id', true)) WITH CHECK ("gym_id" = current_setting('app.gym_id', true));
--> statement-breakpoint
ALTER TABLE "chat_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "chat_sessions" USING ("gym_id" = current_setting('app.gym_id', true)) WITH CHECK ("gym_id" = current_setting('app.gym_id', true));
--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "chat_messages" USING ("gym_id" = current_setting('app.gym_id', true)) WITH CHECK ("gym_id" = current_setting('app.gym_id', true));
--> statement-breakpoint
ALTER TABLE "lead_status_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "lead_status_history" USING ("gym_id" = current_setting('app.gym_id', true)) WITH CHECK ("gym_id" = current_setting('app.gym_id', true));
--> statement-breakpoint
ALTER TABLE "chat_turn_metrics" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "chat_turn_metrics" USING ("gym_id" = current_setting('app.gym_id', true)) WITH CHECK ("gym_id" = current_setting('app.gym_id', true));
--> statement-breakpoint
ALTER TABLE "gym_users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "gym_users" USING ("gym_id" = current_setting('app.gym_id', true)) WITH CHECK ("gym_id" = current_setting('app.gym_id', true));
--> statement-breakpoint
ALTER TABLE "faq_chunks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "faq_chunks" USING ("gym_id" = current_setting('app.gym_id', true)) WITH CHECK ("gym_id" = current_setting('app.gym_id', true));
