"use client";

import { useEffect, useState } from "react";

interface Chunk {
  id: string;
  category: string;
  content: string;
}

interface Category {
  id: string;
  name: string;
}

interface FaqResponse {
  gymId: string;
  gymName: string;
  categories: Category[];
  chunks: Chunk[];
}

export default function InternalFaqPage() {
  const [gyms, setGyms] = useState<string[]>([]);
  const [gymId, setGymId] = useState<string>("");
  const [data, setData] = useState<FaqResponse | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/faq", { credentials: "include" })
      .then((r) => r.json())
      .then((payload: { gyms?: string[] }) => {
        const list = payload.gyms ?? [];
        setGyms(list);
        if (list.length > 0) setGymId(list[0]);
      });
  }, []);

  useEffect(() => {
    if (!gymId) return;
    fetch(`/api/admin/faq?gymId=${gymId}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.error ?? "Failed to load FAQ");
        }
        return r.json();
      })
      .then((payload: FaqResponse) => {
        setData(payload);
        setChunks(payload.chunks);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [gymId]);

  function updateChunk(index: number, patch: Partial<Chunk>) {
    setChunks((current) =>
      current.map((chunk, i) => (i === index ? { ...chunk, ...patch } : chunk)),
    );
  }

  function addChunk() {
    setChunks((current) => [
      ...current,
      { id: `chunk-${Date.now()}`, category: data?.categories[0]?.id ?? "", content: "" },
    ]);
  }

  function removeChunk(index: number) {
    setChunks((current) => current.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/faq", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gymId, chunks }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Save failed",
        );
      }
      setMessage(payload.message ?? "Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label htmlFor="gym-select" className="text-sm text-zinc-600">
          Gym
        </label>
        <select
          id="gym-select"
          value={gymId}
          onChange={(event) => setGymId(event.target.value)}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          {gyms.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addChunk}
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
        >
          + Add chunk
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save FAQ"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-600">{message}</p>}

      {data && (
        <div className="space-y-3">
          {chunks.map((chunk, index) => (
            <div
              key={`${chunk.id}-${index}`}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex gap-3">
                <input
                  type="text"
                  value={chunk.id}
                  onChange={(e) => updateChunk(index, { id: e.target.value })}
                  className="w-56 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
                <select
                  value={chunk.category}
                  onChange={(e) =>
                    updateChunk(index, { category: e.target.value })
                  }
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                >
                  {data.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeChunk(index)}
                  className="ml-auto text-sm text-red-500"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={chunk.content}
                onChange={(e) => updateChunk(index, { content: e.target.value })}
                className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                rows={3}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
