import { sql } from "drizzle-orm";
import { db } from "./client";
import { isPostgres } from "./driver";

/**
 * Runs `fn` inside a Postgres transaction with `app.gym_id` set as a
 * transaction-local GUC before any query executes. The RLS `tenant_isolation`
 * policies on all tenant tables match rows against this value, so any query
 * inside `fn` that forgets a WHERE gym_id filter is blocked at the DB layer.
 *
 * `local = true` in `set_config` scopes the GUC to the current transaction
 * only, making this safe with Neon's pgbouncer transaction-mode pooler
 * (connections return to the pool after each transaction — no GUC bleed).
 *
 * On SQLite (dev/test) there is no RLS and no pooler; `fn` runs directly
 * against the global `db` so all existing code paths work unchanged.
 *
 * Usage:
 *   const leads = await withTenantContext(gymId, (tx) =>
 *     tx.select().from(leads).where(eq(leads.gymId, gymId))
 *   );
 *
 * Note: fn receives `tx` (the drizzle transaction handle) — use it for all
 * queries inside the callback, not the global `db`, or they will run outside
 * the transaction and the GUC won't apply.
 *
 * Admin / cron paths that need cross-tenant access should use the global `db`
 * directly (the owner_bypass RLS policy allows neondb_owner full access).
 */
export async function withTenantContext<T>(
  gymId: string,
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  if (!isPostgres) {
    return fn(db);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pgDb = db as unknown as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pgDb.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT set_config('app.gym_id', ${gymId}, true)`);
    return fn(tx as typeof db);
  });
}

/**
 * Sets app.gym_id as a session-level (non-local) GUC on the current
 * connection. Only use this when you control the full lifecycle of the
 * connection (e.g. a dedicated migration or seeding script). For serverless
 * request handlers always use withTenantContext instead.
 */
export async function setTenantGuc(gymId: string): Promise<void> {
  if (!isPostgres) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as unknown as any).execute(
    sql`SELECT set_config('app.gym_id', ${gymId}, false)`,
  );
}
