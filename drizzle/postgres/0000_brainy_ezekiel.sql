CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"gym_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"gym_id" text NOT NULL,
	"lead_name" text,
	"lead_phone" text,
	"lead_goals" text,
	"lead_status" text DEFAULT 'idle' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_turn_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"gym_id" text NOT NULL,
	"session_id" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"latency_ms" integer,
	"rag_chunk_ids" text,
	"rag_low_confidence" boolean DEFAULT false,
	"rag_full_dump" boolean DEFAULT false,
	"rag_deferred" boolean DEFAULT false,
	"intent_source" text,
	"estimated_cost_usd" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faq_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"gym_id" text NOT NULL,
	"chunk_id" text NOT NULL,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gym_users" (
	"id" text PRIMARY KEY NOT NULL,
	"gym_id" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gyms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"config" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"gym_id" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"actor_phone" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"gym_id" text NOT NULL,
	"session_id" text,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"goals" text NOT NULL,
	"source" text DEFAULT 'chat' NOT NULL,
	"pipeline_status" text DEFAULT 'new' NOT NULL,
	"pipeline_status_updated_at" timestamp with time zone,
	"conversation_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_chat_messages_session" ON "chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_turn_metrics_gym" ON "chat_turn_metrics" USING btree ("gym_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "faq_chunks_gym_chunk_unique" ON "faq_chunks" USING btree ("gym_id","chunk_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gym_users_email_gym_unique" ON "gym_users" USING btree ("gym_id","email");--> statement-breakpoint
CREATE INDEX "idx_status_history_lead" ON "lead_status_history" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_leads_gym_created" ON "leads" USING btree ("gym_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_leads_pipeline" ON "leads" USING btree ("gym_id","pipeline_status");--> statement-breakpoint
CREATE INDEX "idx_faq_chunks_embedding" ON "faq_chunks" USING hnsw ("embedding" vector_cosine_ops);