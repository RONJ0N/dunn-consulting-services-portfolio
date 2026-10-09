"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function GateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/site-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        throw new Error("Invalid password");
      }

      router.push(from.startsWith("/") ? from : "/");
      router.refresh();
    } catch {
      setError("Incorrect password. Contact the site owner for access.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-xl">
        <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
          Private demo
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">Enter password</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          This preview is password-protected so the demo chat isn&apos;t open to
          the public.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="site-password"
              className="text-sm font-medium text-zinc-300"
            >
              Password
            </label>
            <input
              id="site-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-600"
              placeholder="Demo password"
              required
            />
          </div>

          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {isLoading ? "Checking…" : "Continue"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function GatePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
          Loading…
        </main>
      }
    >
      <GateForm />
    </Suspense>
  );
}
