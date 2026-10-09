CREATE TABLE "prospects" (
	"id" text PRIMARY KEY NOT NULL,
	"niche" text NOT NULL,
	"metro" text NOT NULL,
	"business_name" text NOT NULL,
	"phone" text,
	"website" text,
	"address" text,
	"rating" double precision,
	"review_count" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"pipeline_status" text DEFAULT 'prospect' NOT NULL,
	"audit_called_at" timestamp with time zone,
	"audit_outcome" text,
	"audit_notes" text,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_prospects_status" ON "prospects" USING btree ("pipeline_status","updated_at");