CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`gym_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`gym_id` text NOT NULL,
	`lead_name` text,
	`lead_phone` text,
	`lead_goals` text,
	`lead_status` text DEFAULT 'idle' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_turn_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`gym_id` text NOT NULL,
	`session_id` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`latency_ms` integer,
	`rag_chunk_ids` text,
	`rag_low_confidence` integer DEFAULT false,
	`rag_full_dump` integer DEFAULT false,
	`rag_deferred` integer DEFAULT false,
	`intent_source` text,
	`estimated_cost_usd` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `faq_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`gym_id` text NOT NULL,
	`chunk_id` text NOT NULL,
	`category` text NOT NULL,
	`content` text NOT NULL,
	`embedding` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gym_users` (
	`id` text PRIMARY KEY NOT NULL,
	`gym_id` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE TABLE `gyms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lead_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`gym_id` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`actor_phone` text,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`gym_id` text NOT NULL,
	`session_id` text,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`goals` text NOT NULL,
	`source` text DEFAULT 'chat' NOT NULL,
	`pipeline_status` text DEFAULT 'new' NOT NULL,
	`pipeline_status_updated_at` integer,
	`conversation_summary` text,
	`created_at` integer NOT NULL
);
