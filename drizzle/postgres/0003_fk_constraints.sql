-- Referential integrity for the multi-tenant schema.
--
-- gym_id columns reference the gyms registry; deleting a tenant cascades to all
-- of its rows (clean offboarding). Session/lead links cascade so a deleted
-- session/lead never leaves orphaned messages, metrics, or status history.
--
-- Prereq: every active tenant has a gyms row. Disk-based tenants are mirrored
-- into gyms by ensureGymLoaded() / `npm run sync-gym-configs`; DB-onboarded
-- tenants have a row by construction.

ALTER TABLE "leads" ADD CONSTRAINT "fk_leads_gym" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "fk_leads_session" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "fk_chat_sessions_gym" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "fk_chat_messages_gym" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "fk_chat_messages_session" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD CONSTRAINT "fk_status_history_gym" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD CONSTRAINT "fk_status_history_lead" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_turn_metrics" ADD CONSTRAINT "fk_chat_turn_metrics_gym" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_turn_metrics" ADD CONSTRAINT "fk_chat_turn_metrics_session" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "gym_users" ADD CONSTRAINT "fk_gym_users_gym" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "faq_chunks" ADD CONSTRAINT "fk_faq_chunks_gym" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE;
