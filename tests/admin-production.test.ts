import { afterEach, describe, expect, it, vi } from "vitest";
import { adminCredential } from "@/lib/admin/credentials";
import { createAdminSession, validateAdminSession, verifyAdminPassword } from "@/lib/admin/session";

afterEach(() => vi.unstubAllEnvs());

describe("portfolio administrative credentials", () => {
  it("keeps the credential-free local demo usable", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(verifyAdminPassword("demo-admin")).toBe(true);
  });

  it("cannot use the published demo password in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(() => verifyAdminPassword("demo-admin")).toThrow(/ADMIN_PASSWORD/);
    vi.stubEnv("ADMIN_PASSWORD", "demo-admin");
    expect(() => verifyAdminPassword("demo-admin")).toThrow(/ADMIN_PASSWORD/);
  });

  it.each(["ADMIN_SESSION_SECRET", "GYM_ADMIN_SESSION_SECRET"])(
    "requires an independent production %s",
    (name) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv(name, "");
      expect(() => adminCredential(name, "local-demo")).toThrow(name);
    },
  );

  it("verifies a session only with the configured signing secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_SESSION_SECRET", "unit-test-only-signing-secret-for-session-A");
    const token = createAdminSession();
    expect(validateAdminSession(token)).toBe(true);
    vi.stubEnv("ADMIN_SESSION_SECRET", "unit-test-only-signing-secret-for-session-B");
    expect(validateAdminSession(token)).toBe(false);
  });
});
