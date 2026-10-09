/**
 * Sentry stub. Real install:
 *   npm install @sentry/nextjs
 *   npx @sentry/wizard@latest -i nextjs
 *
 * This file intentionally has zero runtime cost when SENTRY_DSN is unset.
 * The logger calls into here only when the DSN is configured.
 */

export async function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  if (!process.env.SENTRY_DSN) {
    return;
  }
  try {
    const moduleName = "@sentry/nextjs"; // dynamic to avoid hard import dependency
    const mod = (await import(/* webpackIgnore: true */ moduleName).catch(
      () => null,
    )) as
      | { captureException?: (error: unknown, scope?: { extra: Record<string, unknown> }) => void; default?: { captureException?: (error: unknown, scope?: { extra: Record<string, unknown> }) => void } }
      | null;
    if (!mod) return;
    const sentry = mod.default ?? mod;
    sentry.captureException?.(error, { extra: context ?? {} });
  } catch {
    // @sentry/nextjs not installed yet — fall through silently.
  }
}
