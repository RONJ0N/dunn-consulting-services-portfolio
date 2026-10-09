import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const gyms = sqliteTable("gyms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  config: text("config").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const gymUsers = sqliteTable("gym_users", {
  id: text("id").primaryKey(),
  gymId: text("gym_id").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
});

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  gymId: text("gym_id").notNull(),
  sessionId: text("session_id"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  goals: text("goals").notNull(),
  source: text("source").notNull().default("chat"),
  pipelineStatus: text("pipeline_status").notNull().default("new"),
  pipelineStatusUpdatedAt: integer("pipeline_status_updated_at", {
    mode: "timestamp",
  }),
  conversationSummary: text("conversation_summary"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const chatSessions = sqliteTable("chat_sessions", {
  id: text("id").primaryKey(),
  gymId: text("gym_id").notNull(),
  leadName: text("lead_name"),
  leadPhone: text("lead_phone"),
  leadEmail: text("lead_email"),
  leadGoals: text("lead_goals"),
  leadStatus: text("lead_status").notNull().default("idle"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  gymId: text("gym_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const leadStatusHistory = sqliteTable("lead_status_history", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  gymId: text("gym_id").notNull(),
  status: text("status").notNull(),
  source: text("source").notNull(),
  actorPhone: text("actor_phone"),
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const chatTurnMetrics = sqliteTable("chat_turn_metrics", {
  id: text("id").primaryKey(),
  gymId: text("gym_id").notNull(),
  sessionId: text("session_id").notNull(),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  latencyMs: integer("latency_ms"),
  ragChunkIds: text("rag_chunk_ids"),
  ragLowConfidence: integer("rag_low_confidence", { mode: "boolean" }).default(false),
  ragFullDump: integer("rag_full_dump", { mode: "boolean" }).default(false),
  ragDeferred: integer("rag_deferred", { mode: "boolean" }).default(false),
  intentSource: text("intent_source"),
  estimatedCostUsd: real("estimated_cost_usd"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const faqChunks = sqliteTable("faq_chunks", {
  id: text("id").primaryKey(),
  gymId: text("gym_id").notNull(),
  chunkId: text("chunk_id").notNull(),
  category: text("category").notNull(),
  content: text("content").notNull(),
  /** JSON-stringified embedding (SQLite has no native vector type). */
  embedding: text("embedding"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/**
 * Agency-side sales pipeline (the Supabase-native CRM): prospects found by
 * the lead-gen engine move prospect -> called -> emailed -> audit_booked ->
 * pilot -> client | lost. Also the store for evidence-audit results.
 */
export const prospects = sqliteTable("prospects", {
  id: text("id").primaryKey(),
  niche: text("niche").notNull(),
  metro: text("metro").notNull(),
  businessName: text("business_name").notNull(),
  phone: text("phone"),
  website: text("website"),
  address: text("address"),
  rating: real("rating"),
  reviewCount: integer("review_count"),
  source: text("source").notNull().default("manual"),
  pipelineStatus: text("pipeline_status").notNull().default("prospect"),
  auditCalledAt: integer("audit_called_at", { mode: "timestamp" }),
  auditOutcome: text("audit_outcome"),
  auditNotes: text("audit_notes"),
  emailedAt: integer("emailed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type NewLeadRow = typeof leads.$inferInsert;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type LeadStatusHistory = typeof leadStatusHistory.$inferSelect;
export type ChatTurnMetric = typeof chatTurnMetrics.$inferSelect;
export type FaqChunkRow = typeof faqChunks.$inferSelect;
export type Gym = typeof gyms.$inferSelect;
export type GymUser = typeof gymUsers.$inferSelect;
export type Prospect = typeof prospects.$inferSelect;
export type NewProspect = typeof prospects.$inferInsert;

export type CaptureLeadStatus =
  | "idle"
  | "collecting_name"
  | "collecting_phone"
  | "collecting_email"
  | "collecting_goals"
  | "complete";
