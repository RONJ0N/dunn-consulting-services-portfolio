"use client";

import { useEffect, useState } from "react";

interface IngestDiff {
  added: { id: string; category: string; content: string }[];
  changed: { existing: { id: string; content: string }; proposed: { id: string; category: string; content: string } }[];
  unchanged: { id: string }[];
  removed: { id: string }[];
}

interface IngestRecord {
  gymId: string;
  generatedAt: string;
  proposed: { id: string; category: string; content: string }[];
  diff: IngestDiff;
}

export default function IngestReviewPage() {
  const [gyms, setGyms] = useState<string[]>([]);
  const [gymId, setGymId] = useState<string>("");
  const [data, setData] = useState<IngestRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/faq", { credentials: "include" })
      .then((r) => r.json())
      .then((p: { gyms?: string[] }) => {
        const list = p.gyms ?? [];
        setGyms(list);
        if (list[0]) setGymId(list[0]);
      });
  }, []);

  useEffect(() => {
    if (!gymId) return;
    setError("");
    fetch(`/api/admin/ingest-diff?gymId=${gymId}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.error ?? "Failed");
        }
        return r.json();
      })
      .then((payload: IngestRecord | null) => setData(payload))
      .catch((err) => setError(err.message));
  }, [gymId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label htmlFor="gym-select" className="text-sm text-zinc-600">
          Gym
        </label>
        <select
          id="gym-select"
          value={gymId}
          onChange={(e) => setGymId(e.target.value)}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          {gyms.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!data && !error && (
        <p className="text-sm text-zinc-500">
          No ingest run found for this gym yet. Run{" "}
          <code className="rounded bg-zinc-100 px-1">npm run ingest -- --gym {gymId} --url ...</code>{" "}
          and then re-load this page to review the diff.
        </p>
      )}

      {data && (
        <div className="space-y-6">
          <p className="text-sm text-zinc-500">
            Generated {new Date(data.generatedAt).toLocaleString()} — {data.proposed.length} proposed chunks.
          </p>

          <Section title={`+ Added (${data.diff.added.length})`} entries={data.diff.added} />
          <ChangedSection entries={data.diff.changed} />
          <Section
            title={`= Unchanged (${data.diff.unchanged.length})`}
            entries={data.diff.unchanged.map((entry) => ({
              id: entry.id,
              category: "",
              content: "(unchanged)",
            }))}
          />
          <Section
            title={`- Existing not covered by new sources (${data.diff.removed.length})`}
            entries={data.diff.removed.map((entry) => ({
              id: entry.id,
              category: "",
              content: "(kept by default; remove manually if outdated)",
            }))}
          />
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  entries,
}: {
  title: string;
  entries: { id: string; category: string; content: string }[];
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-400">None.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-zinc-200 bg-white p-3 text-sm shadow-sm"
            >
              <p className="font-medium text-zinc-800">
                {entry.id}{" "}
                {entry.category && (
                  <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {entry.category}
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-zinc-600">{entry.content}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ChangedSection({
  entries,
}: {
  entries: { existing: { id: string; content: string }; proposed: { id: string; category: string; content: string } }[];
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-zinc-900">
        ~ Changed ({entries.length})
      </h2>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-400">None.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.proposed.id}
              className="rounded-xl border border-zinc-200 bg-white p-3 text-sm shadow-sm"
            >
              <p className="font-medium text-zinc-800">{entry.proposed.id}</p>
              <p className="mt-1 text-xs text-zinc-400">Existing:</p>
              <p className="text-xs text-zinc-600">{entry.existing.content}</p>
              <p className="mt-1 text-xs text-zinc-400">Proposed:</p>
              <p className="text-xs text-zinc-700">{entry.proposed.content}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
