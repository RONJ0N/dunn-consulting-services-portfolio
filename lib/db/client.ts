import fs from "fs";
import path from "path";
import { isPostgres } from "./driver";
import * as sqliteSchema from "./sqlite-schema";
import * as pgSchema from "./pg-schema";

/**
 * Dual-driver database client.
 *
 * - SQLite (default): local development and tests. File at ./data/leads.db,
 *   or /tmp on Vercel (ephemeral — never for paying clients).
 * - Postgres (production): set DATABASE_DRIVER=postgres + DATABASE_URL to the
 *   Supabase pooled connection string. Schema lives in ./pg-schema.ts; apply
 *   migrations with: DATABASE_DRIVER=postgres DATABASE_URL=... npm run db:migrate
 *
 * The exported `db` is typed against the SQLite drizzle instance; the Postgres
 * schema is a field-for-field mirror, so query sites work unchanged.
 */

type SqliteDb = ReturnType<
  typeof import("drizzle-orm/better-sqlite3").drizzle<typeof sqliteSchema>
>;

const globalForDb = globalThis as unknown as {
  db?: SqliteDb;
  ownerDb?: SqliteDb;
};

function getSqlitePath() {
  // Vercel serverless has a read-only project filesystem; SQLite must live in /tmp.
  // Data is ephemeral per instance — use Postgres (Supabase) for production customers.
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    return "/tmp/gym-ai-leads.db";
  }

  const url = process.env.DATABASE_URL ?? "file:./data/leads.db";
  return url.startsWith("file:") ? url.replace("file:", "") : url;
}

function runSqliteMigrations(sqlite: import("better-sqlite3").Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS gyms (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gym_users (
      id TEXT PRIMARY KEY NOT NULL,
      gym_id TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at INTEGER NOT NULL,
      last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY NOT NULL,
      gym_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      goals TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'chat',
      conversation_summary TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      gym_id TEXT NOT NULL,
      lead_name TEXT,
      lead_phone TEXT,
      lead_goals TEXT,
      lead_status TEXT NOT NULL DEFAULT 'idle',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      gym_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lead_status_history (
      id TEXT PRIMARY KEY NOT NULL,
      lead_id TEXT NOT NULL,
      gym_id TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      actor_phone TEXT,
      note TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_turn_metrics (
      id TEXT PRIMARY KEY NOT NULL,
      gym_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      latency_ms INTEGER,
      rag_chunk_ids TEXT,
      rag_low_confidence INTEGER DEFAULT 0,
      rag_full_dump INTEGER DEFAULT 0,
      rag_deferred INTEGER DEFAULT 0,
      intent_source TEXT,
      estimated_cost_usd REAL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS faq_chunks (
      id TEXT PRIMARY KEY NOT NULL,
      gym_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prospects (
      id TEXT PRIMARY KEY NOT NULL,
      niche TEXT NOT NULL,
      metro TEXT NOT NULL,
      business_name TEXT NOT NULL,
      phone TEXT,
      website TEXT,
      address TEXT,
      rating REAL,
      review_count INTEGER,
      source TEXT NOT NULL DEFAULT 'manual',
      pipeline_status TEXT NOT NULL DEFAULT 'prospect',
      audit_called_at INTEGER,
      audit_outcome TEXT,
      audit_notes TEXT,
      emailed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const leadColumns = sqlite
    .prepare("PRAGMA table_info(leads)")
    .all() as Array<{ name: string }>;
  const leadColumnNames = new Set(leadColumns.map((column) => column.name));

  if (!leadColumnNames.has("session_id")) {
    sqlite.exec("ALTER TABLE leads ADD COLUMN session_id TEXT");
  }
  if (!leadColumnNames.has("pipeline_status")) {
    sqlite.exec(
      "ALTER TABLE leads ADD COLUMN pipeline_status TEXT NOT NULL DEFAULT 'new'",
    );
  }
  if (!leadColumnNames.has("pipeline_status_updated_at")) {
    sqlite.exec(
      "ALTER TABLE leads ADD COLUMN pipeline_status_updated_at INTEGER",
    );
  }

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_leads_gym_created ON leads(gym_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_leads_pipeline ON leads(gym_id, pipeline_status);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_status_history_lead ON lead_status_history(lead_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_turn_metrics_gym ON chat_turn_metrics(gym_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_faq_chunks_gym ON faq_chunks(gym_id, chunk_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_users_email ON gym_users(gym_id, email);
    CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(pipeline_status, updated_at);
  `);
}

function createSqliteDb(): SqliteDb {
  // Lazy-require so the better-sqlite3 native module never loads on Postgres
  // deployments (it is not needed there and can fail to build on some hosts).
  /* eslint-disable @typescript-eslint/no-require-imports */
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const { drizzle } =
    require("drizzle-orm/better-sqlite3") as typeof import("drizzle-orm/better-sqlite3");
  /* eslint-enable @typescript-eslint/no-require-imports */

  const dbPath = getSqlitePath();
  const dir = path.dirname(dbPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  runSqliteMigrations(sqlite);

  return drizzle(sqlite, { schema: sqliteSchema });
}

function createPostgresClient(databaseUrl: string): SqliteDb {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const postgres = require("postgres") as typeof import("postgres");
  const { drizzle } =
    require("drizzle-orm/postgres-js") as typeof import("drizzle-orm/postgres-js");
  /* eslint-enable @typescript-eslint/no-require-imports */

  // prepare:false is required for the transaction-mode pooler (pgbouncer).
  const client = postgres(databaseUrl, { prepare: false, max: 5 });
  const db = drizzle(client, { schema: pgSchema });

  // The Postgres schema mirrors the SQLite schema field-for-field; the cast
  // keeps every existing query site typed against one surface.
  return db as unknown as SqliteDb;
}

function createPostgresDb(): SqliteDb {
  // APP_DATABASE_URL points to the limited app_user role (subject to RLS).
  // DATABASE_URL retains the owner connection (used for migrations, admin,
  // and cron cross-tenant queries). When APP_DATABASE_URL is set, all
  // per-request DB access goes through app_user — RLS tenant_isolation
  // policies enforce per-gym isolation at the database layer.
  if (process.env.NODE_ENV === "production" && !process.env.APP_DATABASE_URL) {
    throw new Error("Production Postgres requires APP_DATABASE_URL for the limited tenant role");
  }
  const databaseUrl = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_DRIVER=postgres requires DATABASE_URL (Neon pooled connection string).",
    );
  }
  return createPostgresClient(databaseUrl);
}

function createDb(): SqliteDb {
  return isPostgres ? createPostgresDb() : createSqliteDb();
}

/**
 * Owner-role DB client for ADMIN + CRON cross-tenant queries only.
 *
 * The per-request `db` connects as the limited app_user (APP_DATABASE_URL),
 * which is subject to FORCE RLS — it can only see one tenant's rows at a time
 * (gated by the app.gym_id GUC). Operations that legitimately span every tenant
 * (listing all gyms for the agency admin selector, the registry existence gate,
 * cron digests) must use the owner connection (DATABASE_URL → neondb_owner),
 * which has the owner_bypass policy.
 *
 * NEVER use ownerDb on a public/embed request path — it bypasses tenant
 * isolation. Restrict it to authenticated agency-admin routes and cron.
 *
 * On SQLite (dev/test) there is no RLS, so ownerDb is just the same handle.
 */
function createOwnerDb(): SqliteDb {
  if (!isPostgres) return db;
  const ownerUrl = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;
  if (!ownerUrl) return db;
  // Reuse the app client when no separate owner URL is configured (e.g. single
  // connection string deployments) — there's nothing to escalate to.
  if (!process.env.APP_DATABASE_URL) return db;
  return createPostgresClient(ownerUrl);
}

export const db = globalForDb.db ?? createDb();
export const ownerDb = globalForDb.ownerDb ?? createOwnerDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
  globalForDb.ownerDb = ownerDb;
}
