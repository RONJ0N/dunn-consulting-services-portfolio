import DemoGymHomePage from "@/components/DemoGymHomePage";

/**
 * Production: embed/API host only — no marketing page, no demo chat on `/`.
 * Local dev: full demo gym page for testing at http://localhost:3000.
 */
export default function Home() {
  if (process.env.NODE_ENV === "production") {
    return <main className="min-h-screen bg-white" aria-hidden="true" />;
  }

  return <DemoGymHomePage />;
}
