import ChatWidget from "@/components/ChatWidget";
import OpenChatButton from "@/components/OpenChatButton";
import { getGymConfig } from "@/lib/gym/config";

/** Local-dev demo landing only — never rendered in production. */
export default function DemoGymHomePage() {
  const config = getGymConfig("demo-gym");
  const accent = config.accentColor ?? "#E63946";

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8 sm:py-12">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {config.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">{config.tagline}</p>
          </div>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <a href="#memberships" className="text-zinc-300 hover:text-white">
              Memberships
            </a>
            <a href="#classes" className="text-zinc-300 hover:text-white">
              Classes
            </a>
            <a href="#visit" className="text-zinc-300 hover:text-white">
              Visit
            </a>
            {process.env.SHOW_ADMIN_LINK === "true" ? (
              <a
                href="/admin/dashboard"
                className="rounded-full border border-zinc-700 px-4 py-2 text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              >
                Staff login
              </a>
            ) : null}
          </nav>
        </header>

        <section className="mt-12 sm:mt-16">
          <p
            className="text-sm font-medium uppercase tracking-widest"
            style={{ color: accent }}
          >
            Austin, Texas
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
            Your neighborhood gym — open 24/7 for members
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-zinc-300">
            {config.address}. Staffed front desk during peak hours. Group
            classes, personal training, and memberships that fit how you train.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <OpenChatButton accentColor={accent} label="Ask a question" />
            <a
              href="#visit"
              className="inline-flex items-center rounded-full border border-zinc-600 px-6 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-400 hover:text-white"
            >
              Plan your visit
            </a>
          </div>
        </section>

        <section className="mt-16 grid gap-6 sm:grid-cols-3">
          <article
            id="hours"
            className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
          >
            <h3 className="text-lg font-semibold">Hours</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-zinc-300">
              <li>
                <span className="text-zinc-500">Members</span> — 24/7 access
              </li>
              <li>
                <span className="text-zinc-500">Front desk</span> — Mon–Fri
                5:00 AM–10:00 PM
              </li>
              <li>Sat 6:00 AM–8:00 PM · Sun 7:00 AM–6:00 PM</li>
              <li>Major holidays: staffed 8:00 AM–2:00 PM</li>
            </ul>
          </article>

          <article
            id="memberships"
            className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
          >
            <h3 className="text-lg font-semibold">Memberships</h3>
            <ul className="mt-4 space-y-3 text-sm text-zinc-300">
              <li>
                <strong className="text-white">Basic</strong> — $29/mo · 24/7
                gym floor, no group classes
              </li>
              <li>
                <strong className="text-white">Plus</strong> — $49/mo ·
                unlimited classes (yoga, spin, HIIT, strength)
              </li>
              <li>
                <strong className="text-white">Premium</strong> — $79/mo · Plus
                + 2 PT sessions/mo, sauna, guest passes
              </li>
            </ul>
            <p className="mt-4 text-xs text-zinc-500">
              Student discount available. Annual plans save 15%.
            </p>
          </article>

          <article
            id="classes"
            className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
          >
            <h3 className="text-lg font-semibold">Classes</h3>
            <ul className="mt-4 space-y-2 text-sm text-zinc-300">
              <li>Power &amp; gentle flow yoga</li>
              <li>Spin — reserve bikes in the app</li>
              <li>HIIT Burn &amp; barbell strength</li>
              <li>Drop-in $15 for non-members (Plus/Premium included)</li>
            </ul>
            <p className="mt-4 text-xs text-zinc-500">
              Full schedule in chat — ask &quot;what classes do you offer?&quot;
            </p>
          </article>
        </section>

        <section
          id="visit"
          className="mt-12 rounded-2xl border p-8 sm:p-10"
          style={{
            borderColor: `${accent}55`,
            background: `linear-gradient(135deg, rgb(24 24 27 / 0.9), rgb(39 39 42 / 0.6))`,
          }}
        >
          <h3 className="text-xl font-semibold">Visit us</h3>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="space-y-3 text-sm text-zinc-300">
              <p>
                <span className="font-medium text-zinc-200">Address</span>
                <br />
                {config.address}
              </p>
              {config.publicPhone ? (
                <p>
                  <span className="font-medium text-zinc-200">Phone</span>
                  <br />
                  <a
                    href={`tel:${config.publicPhone.replace(/\D/g, "")}`}
                    className="hover:text-white"
                  >
                    {config.publicPhone}
                  </a>
                </p>
              ) : null}
              {config.contactEmail ? (
                <p>
                  <span className="font-medium text-zinc-200">Email</span>
                  <br />
                  <a
                    href={`mailto:${config.contactEmail}`}
                    className="hover:text-white"
                  >
                    {config.contactEmail}
                  </a>
                </p>
              ) : null}
            </div>
            <div className="text-sm text-zinc-300">
              <p className="font-medium text-zinc-200">New here?</p>
              <ul className="mt-3 space-y-2">
                <li>Free 1-day pass for first-time visitors</li>
                <li>7-day trial available — ask in chat</li>
                <li>Free tours — book through the chat assistant anytime</li>
              </ul>
            </div>
          </div>
        </section>

        <footer className="mt-auto border-t border-zinc-800 pt-8 text-sm text-zinc-500">
          <p>
            © {new Date().getFullYear()} {config.name}. Local dev demo only.
          </p>
        </footer>
      </div>

      <ChatWidget
        gymId="demo-gym"
        gymName={config.name}
        accentColor={config.accentColor}
        publicPhone={config.publicPhone}
      />
    </main>
  );
}
