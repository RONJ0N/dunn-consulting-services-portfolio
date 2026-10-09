/**
 * Lightweight structured logger. Writes single-line JSON to stdout/stderr so
 * log drains (Vercel Log Drains, Datadog, Sentry breadcrumbs via integration)
 * can ingest them. Replace this with pino + a transport in production if you
 * need more throughput.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogPayload {
  level: LogLevel;
  event: string;
  timestamp: string;
  [key: string]: unknown;
}

function emit(payload: LogPayload) {
  const line = JSON.stringify(payload);
  if (payload.level === "error" || payload.level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function logInfo(event: string, context?: Record<string, unknown>) {
  emit({
    level: "info",
    event,
    timestamp: new Date().toISOString(),
    ...context,
  });
}

export function logWarn(event: string, context?: Record<string, unknown>) {
  emit({
    level: "warn",
    event,
    timestamp: new Date().toISOString(),
    ...context,
  });
}

export function logError(
  event: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  const errorPayload =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { value: String(error) };
  emit({
    level: "error",
    event,
    timestamp: new Date().toISOString(),
    error: errorPayload,
    ...context,
  });

  if (process.env.SENTRY_DSN) {
    // Sentry integration is loaded lazily so it's only required when configured.
    void import("./sentry")
      .then(({ captureException }) => captureException(error, { event, ...context }))
      .catch(() => {
        // Sentry not installed yet — drop the breadcrumb silently.
      });
  }
}

export function startTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
