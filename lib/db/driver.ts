/**
 * Single source of truth for which database dialect is active.
 *
 * Production (Vercel + Supabase): set DATABASE_DRIVER=postgres and
 * DATABASE_URL to the Supabase pooled connection string.
 * Local development defaults to SQLite at ./data/leads.db.
 */
export const isPostgres =
  (process.env.DATABASE_DRIVER ?? "").toLowerCase() === "postgres" ||
  (process.env.DATABASE_URL ?? "").startsWith("postgres");
