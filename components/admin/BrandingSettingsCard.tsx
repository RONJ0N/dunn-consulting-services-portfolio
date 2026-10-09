"use client";

import { useEffect, useRef, useState } from "react";

type BrandingForm = {
  accentColor: string;
  bookingUrl: string;
  bookingEnabled: boolean;
  publicPhone: string;
  greeting: string;
  logoUrl: string;
  quickStarts: string[];
  ctaTour: string;
  ctaSignup: string;
  allowedOrigins: string[];
};

const EMPTY_FORM: BrandingForm = {
  accentColor: "#2563eb",
  bookingUrl: "",
  bookingEnabled: false,
  publicPhone: "",
  greeting: "",
  logoUrl: "",
  quickStarts: [""],
  ctaTour: "",
  ctaSignup: "",
  allowedOrigins: [],
};

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400";

const INPUT_CLASS_INLINE =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400";

type BrandingApiResponse = {
  accentColor: string;
  bookingUrl: string | null;
  bookingEnabled: boolean;
  publicPhone: string;
  allowedOrigins: string[];
  branding: {
    accentColor: string;
    greeting: string;
    logoUrl: string | null;
    quickStarts: string[];
    ctaCopy: { tour: string; signup: string };
  };
};

function toForm(data: BrandingApiResponse): BrandingForm {
  const quickStarts =
    data.branding.quickStarts.length > 0
      ? data.branding.quickStarts.slice(0, 6)
      : [""];

  return {
    accentColor: data.accentColor,
    bookingUrl: data.bookingUrl ?? "",
    bookingEnabled: data.bookingEnabled,
    publicPhone: data.publicPhone ?? "",
    greeting: data.branding.greeting ?? "",
    logoUrl: data.branding.logoUrl ?? "",
    quickStarts,
    ctaTour: data.branding.ctaCopy.tour ?? "",
    ctaSignup: data.branding.ctaCopy.signup ?? "",
    allowedOrigins: data.allowedOrigins ?? [],
  };
}

export function BrandingSettingsCard({ gymId }: { gymId: string }) {
  const [form, setForm] = useState<BrandingForm>(EMPTY_FORM);
  const [loadedForGymId, setLoadedForGymId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const loadSeqRef = useRef(0);
  const gymIdRef = useRef(gymId);

  useEffect(() => {
    gymIdRef.current = gymId;
  }, [gymId]);

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
          `/api/admin/branding?gymId=${encodeURIComponent(gymId)}`,
          {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (response.status === 404) {
          throw new Error(`No branding config found for "${gymId}".`);
        }
        if (!response.ok) {
          throw new Error("Failed to load branding settings");
        }

        const data = (await response.json()) as BrandingApiResponse;
        if (seq !== loadSeqRef.current || controller.signal.aborted) {
          return;
        }

        setForm(toForm(data));
        setLoadedForGymId(gymId);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        if (seq !== loadSeqRef.current) {
          return;
        }
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load branding",
        );
      } finally {
        if (seq === loadSeqRef.current && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [gymId]);

  async function reloadBranding() {
    const targetGymId = gymIdRef.current;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/branding?gymId=${encodeURIComponent(targetGymId)}`,
        { credentials: "include", cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error("Failed to reload branding settings");
      }
      const data = (await response.json()) as BrandingApiResponse;
      if (seq !== loadSeqRef.current || targetGymId !== gymIdRef.current) {
        return;
      }
      setForm(toForm(data));
      setLoadedForGymId(targetGymId);
    } catch (reloadError) {
      if (seq !== loadSeqRef.current || targetGymId !== gymIdRef.current) {
        return;
      }
      setError(
        reloadError instanceof Error
          ? reloadError.message
          : "Failed to reload branding",
      );
    } finally {
      if (seq === loadSeqRef.current && targetGymId === gymIdRef.current) {
        setLoading(false);
      }
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const saveGymId = gymIdRef.current;
    setSaving(true);
    setError("");
    setMessage("");

    const quickStarts = form.quickStarts.map((s) => s.trim()).filter(Boolean);
    if (quickStarts.length === 0) {
      setError("Add at least one quick-start button label.");
      setSaving(false);
      return;
    }

    const allowedOrigins = form.allowedOrigins
      .map((o) => {
        const trimmed = o.trim();
        try {
          const url = new URL(
            trimmed.includes("://") ? trimmed : `https://${trimmed}`,
          );
          return url.hostname.toLowerCase();
        } catch {
          return trimmed.toLowerCase();
        }
      })
      .filter(Boolean);

    try {
      const response = await fetch("/api/admin/branding", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: saveGymId,
          accentColor: form.accentColor,
          bookingUrl: form.bookingUrl.trim() || null,
          bookingEnabled: form.bookingEnabled,
          publicPhone: form.publicPhone.trim(),
          allowedOrigins,
          branding: {
            greeting: form.greeting.trim(),
            accentColor: form.accentColor,
            logoUrl: form.logoUrl.trim() || null,
            quickStarts,
            ctaCopy: {
              tour: form.ctaTour.trim(),
              signup: form.ctaSignup.trim(),
            },
          },
        }),
      });

      if (saveGymId !== gymIdRef.current) {
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to save branding");
      }

      setMessage("Branding saved — live on the embed within about a minute.");
      await reloadBranding();
    } catch (saveError) {
      if (saveGymId !== gymIdRef.current) {
        return;
      }
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save branding",
      );
    } finally {
      if (saveGymId === gymIdRef.current) {
        setSaving(false);
      }
    }
  }

  function updateQuickStart(index: number, value: string) {
    setForm((current) => {
      const next = [...current.quickStarts];
      next[index] = value;
      return { ...current, quickStarts: next };
    });
  }

  function addQuickStart() {
    setForm((current) =>
      current.quickStarts.length >= 6
        ? current
        : { ...current, quickStarts: [...current.quickStarts, ""] },
    );
  }

  function removeQuickStart(index: number) {
    setForm((current) => {
      const next = current.quickStarts.filter((_, i) => i !== index);
      return {
        ...current,
        quickStarts: next.length > 0 ? next : [""],
      };
    });
  }

  function updateAllowedOrigin(index: number, value: string) {
    setForm((current) => {
      const next = [...current.allowedOrigins];
      next[index] = value;
      return { ...current, allowedOrigins: next };
    });
  }

  function addAllowedOrigin() {
    setForm((current) =>
      current.allowedOrigins.length >= 20
        ? current
        : { ...current, allowedOrigins: [...current.allowedOrigins, ""] },
    );
  }

  function removeAllowedOrigin(index: number) {
    setForm((current) => ({
      ...current,
      allowedOrigins: current.allowedOrigins.filter((_, i) => i !== index),
    }));
  }

  if (!gymId.trim()) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">
        Select a business above to edit widget branding.
      </div>
    );
  }

  const formReady = loadedForGymId === gymId && !loading;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm text-zinc-900 [color-scheme:light]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Widget branding</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Agency-only: greeting, colors, Calendly link, logo, and quick-start
            buttons for{" "}
            <span className="font-medium text-zinc-800">{gymId}</span>. Knowledge
            base and chat rules are managed separately (not shown to business
            logins).
          </p>
        </div>
        {formReady && form.accentColor ? (
          <div
            className="h-10 w-10 shrink-0 rounded-xl border border-zinc-200"
            style={{ backgroundColor: form.accentColor }}
            title={form.accentColor}
          />
        ) : null}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">Loading branding for {gymId}…</p>
      ) : error && !formReady ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : formReady ? (
        <form onSubmit={save} className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Opening greeting</span>
            <textarea
              value={form.greeting}
              onChange={(event) =>
                setForm((current) => ({ ...current, greeting: event.target.value }))
              }
              rows={3}
              className={INPUT_CLASS}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">Accent color</span>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      accentColor: event.target.value,
                    }))
                  }
                  className="h-10 w-14 cursor-pointer rounded-xl border border-zinc-200 bg-white"
                />
                <input
                  type="text"
                  value={form.accentColor}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      accentColor: event.target.value,
                    }))
                  }
                  className={`flex-1 ${INPUT_CLASS_INLINE}`}
                />
              </div>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">Logo URL (optional)</span>
              <input
                type="url"
                value={form.logoUrl}
                onChange={(event) =>
                  setForm((current) => ({ ...current, logoUrl: event.target.value }))
                }
                placeholder="https://…"
                className={INPUT_CLASS}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="block text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-zinc-700">Booking URL (Calendly)</span>
                <label className="flex items-center gap-2 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={form.bookingEnabled}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        bookingEnabled: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  Show in widget
                </label>
              </div>
              <input
                type="url"
                value={form.bookingUrl}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    bookingUrl: event.target.value,
                  }))
                }
                placeholder="https://calendly.com/…"
                className={INPUT_CLASS}
              />
              <p className="mt-1 text-xs text-zinc-500">
                URL is saved even when hidden. Turn off to remove the header button
                without losing the link for SMS templates.
              </p>
            </div>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">Public phone</span>
              <input
                type="text"
                value={form.publicPhone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    publicPhone: event.target.value,
                  }))
                }
                placeholder="(555) 555-0100"
                className={INPUT_CLASS}
              />
            </label>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-zinc-700">
              Quick-start buttons (max 6)
            </legend>
            <div className="mt-2 space-y-2">
              {form.quickStarts.map((value, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={value}
                    onChange={(event) =>
                      updateQuickStart(index, event.target.value)
                    }
                    placeholder="e.g. What services do you offer?"
                    className={`flex-1 ${INPUT_CLASS_INLINE}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeQuickStart(index)}
                    disabled={form.quickStarts.length === 1}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            {form.quickStarts.length < 6 ? (
              <button
                type="button"
                onClick={addQuickStart}
                className="mt-2 text-sm font-medium text-zinc-800 underline"
              >
                Add button
              </button>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">CTA: tour / book</span>
              <input
                type="text"
                value={form.ctaTour}
                onChange={(event) =>
                  setForm((current) => ({ ...current, ctaTour: event.target.value }))
                }
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">CTA: signup</span>
              <input
                type="text"
                value={form.ctaSignup}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    ctaSignup: event.target.value,
                  }))
                }
                className={INPUT_CLASS}
              />
            </label>
          </div>

          <fieldset className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <legend className="px-1 text-sm font-semibold text-zinc-800">
              Allowed embed domains
            </legend>
            <p className="mt-1 text-xs text-zinc-500">
              The widget only loads on these domains. Leave empty to allow any site
              (not recommended for live clients).
            </p>
            <div className="mt-3 space-y-2">
              {form.allowedOrigins.length === 0 ? (
                <p className="text-xs font-medium text-amber-700">
                  No domains configured — widget can be embedded anywhere.
                </p>
              ) : (
                form.allowedOrigins.map((value, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={value}
                      onChange={(event) =>
                        updateAllowedOrigin(index, event.target.value)
                      }
                      placeholder="dunnconsulting.org"
                      className={`flex-1 ${INPUT_CLASS_INLINE}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeAllowedOrigin(index)}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={addAllowedOrigin}
              className="mt-2 text-sm font-medium text-zinc-800 underline"
            >
              Add domain
            </button>
          </fieldset>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save branding"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
