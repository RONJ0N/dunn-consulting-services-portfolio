import { isAdminAuthenticated } from "./session";
import { getGymAdminSession } from "./gym-auth";

export type DashboardAccess =
  | { scope: "global" }
  | { scope: "gym"; gymId: string; userId: string; role: string };

/**
 * Unified dashboard authorization. Two ways in:
 * - Global admin (agency staff) via ADMIN_PASSWORD — full access to every tenant.
 * - Per-tenant login (client owners/staff) via gym_users — scoped to their gym.
 *
 * Pass `gymId` to also enforce that a tenant session matches that tenant.
 */
export async function getDashboardAccess(
  gymId?: string,
): Promise<DashboardAccess | null> {
  if (await isAdminAuthenticated()) {
    return { scope: "global" };
  }

  const session = await getGymAdminSession();
  if (!session) {
    return null;
  }
  if (gymId && session.gymId !== gymId) {
    return null;
  }
  return {
    scope: "gym",
    gymId: session.gymId,
    userId: session.userId,
    role: session.role,
  };
}
