import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin/session";

export default async function InternalAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await isAdminAuthenticated();
  if (!authed) {
    redirect("/admin/dashboard");
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900">Internal tools</h1>
          <nav className="flex gap-4 text-sm">
            <a className="text-zinc-700 hover:underline" href="/admin/dashboard">
              ← Dashboard
            </a>
            <a className="text-zinc-700 hover:underline" href="/admin/internal/faq">
              FAQ
            </a>
            <a className="text-zinc-700 hover:underline" href="/admin/internal/ingest">
              Ingest review
            </a>
          </nav>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          For your internal team only. Not exposed to gym owners.
        </p>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
