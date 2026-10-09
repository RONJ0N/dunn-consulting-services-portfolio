/**
 * Postgres mirror of lib/db/schema.ts (SQLite source-of-truth).
 *
 * Used when DATABASE_DRIVER=postgres. Keep field names + types in sync with
 * the SQLite schema. The pgvector extension is required for the `embedding`
 * column — run `CREATE EXTENSION IF NOT EXISTS vector;` once in your Supabase
 * SQL editor before migrating.
 */
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Custom column type for pgvector embeddings. We store the embedding as a
 * native `vector(1536)` column — make sure `CREATE EXTENSION vector;` has
 * been run in the target database before migrating.
 */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    return JSON.parse(value as string) as number[];
  },
});

export const gyms = pgTable("gyms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  config: text("config").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const gymUsers = pgTable(
  "gym_users",
  {
    id: text("id").primaryKey(),
    gymId: text("gym_id").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => ({
    emailGymUnique: uniqueIndex("gym_users_email_gym_unique").on(
      table.gymId,
      table.email,
    ),
  }),
);

export const leads = pgTable(
  "leads",
  {
    id: text("id").primaryKey(),
    gymId: text("gym_id").notNull(),
    sessionId: text("session_id"),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    goals: text("goals").notNull(),
    source: text("source").notNull().default("chat"),
    pipelineStatus: text("pipeline_status").notNull().default("new"),
    pipelineStatusUpdatedAt: timestamp("pipeline_status_updated_at", {
      withTimezone: true,
    }),
    conversationSummary: text("conversation_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    gymCreatedIdx: index("idx_leads_gym_created").on(
      table.gymId,
      table.createdAt,
    ),
    pipelineIdx: index("idx_leads_pipeline").on(
      table.gymId,
      table.pipelineStatus,
    ),
  }),
);

export const chatSessions = pgTable("chat_sessions", {
  id: text("id").primaryKey(),
  gymId: text("gym_id").notNull(),
  leadName: text("lead_name"),
  leadPhone: text("lead_phone"),
  leadEmail: text("lead_email"),
  leadGoals: text("lead_goals"),
  leadStatus: text("lead_status").notNull().default("idle"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    gymId: text("gym_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sessionIdx: index("idx_chat_messages_session").on(
      table.sessionId,
      table.createdAt,
    ),
  }),
);

export const leadStatusHistory = pgTable(
  "lead_status_history",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id").notNull(),
    gymId: text("gym_id").notNull(),
    status: text("status").notNull(),
    source: text("source").notNull(),
    actorPhone: text("actor_phone"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    leadIdx: index("idx_status_history_lead").on(table.leadId, table.createdAt),
  }),
);

export const chatTurnMetrics = pgTable(
  "chat_turn_metrics",
  {
    id: text("id").primaryKey(),
    gymId: text("gym_id").notNull(),
    sessionId: text("session_id").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    latencyMs: integer("latency_ms"),
    ragChunkIds: text("rag_chunk_ids"),
    ragLowConfidence: boolean("rag_low_confidence").default(false),
    ragFullDump: boolean("rag_full_dump").default(false),
    ragDeferred: boolean("rag_deferred").default(false),
    intentSource: text("intent_source"),
    estimatedCostUsd: doublePrecision("estimated_cost_usd"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    gymCreatedIdx: index("idx_chat_turn_metrics_gym").on(
      table.gymId,
      table.createdAt,
    ),
  }),
);

/**
 * Agency-side sales pipeline (the Supabase-native CRM). Mirror of the
 * SQLite definition in sqlite-schema.ts.
 */
export const prospects = pgTable(
  "prospects",
  {
    id: text("id").primaryKey(),
    niche: text("niche").notNull(),
    metro: text("metro").notNull(),
    businessName: text("business_name").notNull(),
    phone: text("phone"),
    website: text("website"),
    address: text("address"),
    rating: doublePrecision("rating"),
    reviewCount: integer("review_count"),
    source: text("source").notNull().default("manual"),
    pipelineStatus: text("pipeline_status").notNull().default("prospect"),
    auditCalledAt: timestamp("audit_called_at", { withTimezone: true }),
    auditOutcome: text("audit_outcome"),
    auditNotes: text("audit_notes"),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusIdx: index("idx_prospects_status").on(
      table.pipelineStatus,
      table.updatedAt,
    ),
  }),
);

/**
 * FAQ chunks with pgvector embeddings. The embedding column is typed as
 * raw SQL `vector(1536)` because Drizzle doesn't ship a vector type for
 * pg-core out of the box. The `text-embedding-3-small` model outputs
 * 1536-dim vectors — update the dimension if you change models.
 */
export const faqChunks = pgTable(
  "faq_chunks",
  {
    id: text("id").primaryKey(),
    gymId: text("gym_id").notNull(),
    chunkId: text("chunk_id").notNull(),
    category: text("category").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    gymChunkUnique: uniqueIndex("faq_chunks_gym_chunk_unique").on(
      table.gymId,
      table.chunkId,
    ),
  }),
);
