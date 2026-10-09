"use client";

import { useEffect, useRef, useState } from "react";
import { COMMON_TIMEZONES } from "@/lib/gym/notifications";

type NotificationForm = {
  dailyDigestEnabled: boolean;
  timezone: string;
  dailyDigestHour: number;
};

const EMPTY_FORM: NotificationForm = {
  dailyDigestEnabled: true,
  timezone: "America/New_York",
  dailyDigestHour: 9,
};

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900";

type NotificationApiResponse = NotificationForm & { gymId: string };

export function NotificationSettingsCard({ gymId }: { gymId: string }) {
  const [form, setForm] = useState<NotificationForm>(EMPTY_FORM);
  const [loadedForGymId, setLoadedForGymId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const loadSeqRef = useRef(0);

  useEffect(() => {
    if (!gymId.trim()) {
      setLoading(false);
      setLoadedForGymId(null);
      return;
    }

    const seq = ++loadSeqRef.current;
    const controller = new AbortController();
    setLoading(true);
    setLoadedForGymId(null);
    setError("");
    setMessage("");
    setForm(EMPTY_FORM);

    void (async () => {
      try {
        const response = await fetch(
          `/api/admin/notifications?gymId=${encodeURIComponent(gymId)}`,
          {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error("Failed to load notification settings");
        }
        const data = (await response.json()) as NotificationApiResponse;
        if (seq !== loadSeqRef.current || controller.signal.aborted) {
          return;
        }
        setForm({
          dailyDigestEnabled: data.dailyDigestEnabled,
          timezone: data.timezone,
          dailyDigestHour: data.dailyDigestHour,
        });
        setLoadedForGymId(gymId);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        if (seq !== loadSeqRef.current) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load notification settings",
        );
      } finally {
        if (seq === loadSeqRef.current && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [gymId]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/notifications", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId,
          dailyDigestEnabled: form.dailyDigestEnabled,
          timezone: form.timezone,
          dailyDigestHour: form.dailyDigestHour,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to save notification settings");
      }

      setMessage("Notification settings saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save notification settings",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
        Loading notification settings…
      </div>
    );
  }

  if (loadedForGymId !== gymId) {
    return null;
  }

  return (
    <form
      onSubmit={save}
      className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm text-zinc-900 [color-scheme:light]"
    >
      <h2 className="text-lg font-semibold text-zinc-900">Lead notifications</h2>
      <p className="mt-2 text-sm text-zinc-600">
        New leads still trigger an immediate email. Enable the daily digest to also
        receive a summary of the previous day&apos;s leads each morning.
      </p>

      <div className="mt-4 space-y-4">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.dailyDigestEnabled}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                dailyDigestEnabled: event.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-zinc-300"
          />
          <span className="font-medium text-zinc-700">
            Send daily lead digest email
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Timezone</span>
            <select
              value={form.timezone}
              onChange={(event) =>
                setForm((current) => ({ ...current, timezone: event.target.value }))
              }
              className={INPUT_CLASS}
            >
              {COMMON_TIMEZONES.map((zone) => (
                <option key={zone.value} value={zone.value}>
                  {zone.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Digest send time</span>
            <select
              value={form.dailyDigestHour}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  dailyDigestHour: Number(event.target.value),
                }))
              }
              className={INPUT_CLASS}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {hour === 0
                    ? "12:00 AM"
                    : hour < 12
                      ? `${hour}:00 AM`
                      : hour === 12
                        ? "12:00 PM"
                        : `${hour - 12}:00 PM`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              Local time in the tenant&apos;s timezone. Default is 9:00 AM.
            </p>
          </label>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}

      <button
        type="submit"
        disabled={saving}
        className="mt-4 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save notification settings"}
      </button>
    </form>
  );
}
