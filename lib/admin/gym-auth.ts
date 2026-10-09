import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { gymUsers, type GymUser } from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant-db";
import { adminCredential } from "./credentials";

const COOKIE_NAME = "gym_admin_session_v2";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function getSecret(): string {
  return adminCredential("GYM_ADMIN_SESSION_SECRET", "local-demo-gym-session-secret");
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface GymAdminSession {
  userId: string;
  gymId: string;
  role: string;
  expiresAt: number;
}

export function createGymAdminSessionToken(input: GymAdminSession): string {
  const json = JSON.stringify(input);
  const encoded = Buffer.from(json).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function decodeGymAdminSession(
  token: string | undefined,
): GymAdminSession | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(encoded))) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf-8"),
    ) as GymAdminSession;
    if (Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createGymAdminUser(input: {
  gymId: string;
  email: string;
  password: string;
  role?: "owner" | "manager" | "staff";
}): Promise<GymUser> {
  return withTenantContext(input.gymId, async (tx) => {
    const existing = await tx
      .select()
      .from(gymUsers)
      .where(
        and(eq(gymUsers.gymId, input.gymId), eq(gymUsers.email, input.email)),
      )
      .limit(1);
    if (existing[0]) {
      throw new Error(`User ${input.email} already exists for gym ${input.gymId}`);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const now = new Date();
    const row: GymUser = {
      id: randomUUID(),
      gymId: input.gymId,
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role ?? "owner",
      createdAt: now,
      lastLoginAt: null,
    };
    await tx.insert(gymUsers).values(row);
    return row;
  });
}

export async function authenticateGymAdmin(
  gymId: string,
  email: string,
  password: string,
): Promise<GymUser | null> {
  // Production connects as app_user (APP_DATABASE_URL), which is subject to
  // RLS on gym_users. Set app.gym_id before querying so tenant_isolation allows
  // the login lookup for this gym.
  return withTenantContext(gymId, async (tx) => {
    const rows = await tx
      .select()
      .from(gymUsers)
      .where(
        and(eq(gymUsers.gymId, gymId), eq(gymUsers.email, email.toLowerCase())),
      )
      .limit(1);

    const user = rows[0];
    if (!user) return null;

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;

    await tx
      .update(gymUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(gymUsers.id, user.id));

    return user;
  });
}

export async function getGymAdminSession(): Promise<GymAdminSession | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  return decodeGymAdminSession(value);
}

export async function requireGymAdmin(
  gymId?: string,
): Promise<GymAdminSession | null> {
  const session = await getGymAdminSession();
  if (!session) return null;
  if (gymId && session.gymId !== gymId) return null;
  return session;
}

export { COOKIE_NAME as GYM_ADMIN_COOKIE_NAME, SESSION_TTL_MS };
