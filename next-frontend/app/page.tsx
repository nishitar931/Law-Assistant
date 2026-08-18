import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen bg-page text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b border-[color:var(--color-border)]">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            
            <span className="hidden sm:inline text-sm px-2 py-1 rounded-full border border-[color:var(--color-border)]">
              Legal Assistant
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#features" className="hover:underline underline-offset-4">
              Features
            </a>
            <a href="#how-it-works" className="hover:underline underline-offset-4">
              How it works
            </a>
            <a href="#assist" className="hover:underline underline-offset-4">
              AI Assist
            </a>
            <a href="#faq" className="hover:underline underline-offset-4">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn btn-ghost text-sm">
              Sign in
            </Link>
            <Link href="/register" className="btn btn-primary text-sm">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pt-16 pb-12 lg:pt-24 lg:pb-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>


            <h1 className="mt-4 text-balance font-black tracking-[-0.02em]">
              Find a lawyer, chat securely, and get AI-powered legal insights.
            </h1>
            <p className="mt-4 text-pretty text-[15px] leading-relaxed text-[color:var(--color-muted)]">
              A streamlined platform for clients and lawyers: discover nearby professionals,
              message in real time, and optionally upload documents for an AI summary before you talk.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/register" className="btn btn-primary h-11 px-5">
                Create your account
              </Link>
              <Link href="/login" className="btn h-11 px-5">
                I already have an account
              </Link>
            </div>

            <div className="mt-6 text-xs text-[color:var(--color-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <Image src="/vercel.svg" alt="" width={14} height={14} className="dark:invert" aria-hidden />
                <span>Fast, secure & role-based access</span>
              </span>
            </div>
          </div>

          <div className="surface p-4 lg:p-6">
            {/* Simple “product” mockup */}
            <div className="rounded-xl overflow-hidden border border-[color:var(--color-border)]">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-[color:var(--color-border)] bg-[color:var(--color-soft)]">
                <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
                <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
                <span className="ml-3 text-xs text-[color:var(--color-muted)]">/app/messages/[user]</span>
              </div>
              <div className="grid md:grid-cols-3">
                {/* Sidebar */}
                <aside className="hidden md:block border-r border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3">
                  <div className="text-xs uppercase tracking-wide text-[color:var(--color-muted)] mb-2">Partners</div>
                  <ul className="space-y-2">
                    {["sara@firm.com", "alex@firm.com", "casey@firm.com"].map((e) => (
                      <li key={e} className="card p-2">
                        <p className="text-sm font-medium truncate">{e}</p>
                        <p className="text-xs text-[color:var(--color-muted)] truncate">Last: Let’s schedule a call</p>
                      </li>
                    ))}
                  </ul>
                </aside>

                {/* Chat */}
                <div className="md:col-span-2 p-4">
                  <div className="text-sm text-[color:var(--color-muted)] mb-2">Today, 10:24 AM</div>
                  <div className="space-y-3">
                    <div className="max-w-[80%] rounded-xl px-3 py-2 bg-[color:var(--color-panel)] border border-[color:var(--color-border)] animate-in">
                      <p className="text-sm">Hi! I need help reviewing a tenant agreement.</p>
                      <p className="mt-1 text-[11px] text-[color:var(--color-muted)]">You · 10:24</p>
                    </div>
                    <div className="max-w-[80%] ml-auto rounded-xl px-3 py-2 bg-[color:var(--color-accent)] text-white pop-in">
                      <p className="text-sm">Sure—share the details. I’ll walk you through clauses.</p>
                      <p className="mt-1 text-[11px] opacity-80">Lawyer · 10:25</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                    <input
                      aria-label="Type your message"
                      placeholder="Type your message…"
                      className="h-11"
                    />
                    <button type="button" className="btn btn-primary h-11 px-4">
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs text-[color:var(--color-muted)]">
              Demo UI preview — real messaging appears after you sign in.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-12 lg:py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h2>Everything you need to start a legal conversation</h2>
          <p className="mt-3 text-[15px] text-[color:var(--color-muted)]">
            Designed for clarity and speed—whether you’re a client seeking help or a lawyer managing inquiries.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: "Discover nearby lawyers",
              desc: "Search by name, city, or within a radius using precise geolocation.",
              icon: "/globe.svg",
            },
            {
              title: "Secure messaging",
              desc: "Client ↔ Lawyer chat with clean threads and timestamps.",
              icon: "/window.svg",
            },
            {
              title: "AI Assist (optional)",
              desc: "Upload a PDF or paste text to get structured summaries before you chat.",
              icon: "/file.svg",
            },
            {
              title: "Simple onboarding",
              desc: "Register as client or lawyer; update your location anytime.",
              icon: "/vercel.svg",
            },
            {
              title: "Fast & responsive",
              desc: "Built with Next.js App Router, Tailwind v4, and a Flask backend.",
              icon: "/window.svg",
            },
            {
              title: "Accessible by default",
              desc: "Color-contrast friendly, keyboard navigable, and screen-reader considerate.",
              icon: "/globe.svg",
            },
          ].map((f) => (
            <div key={f.title} className="card p-5">
              <div className="flex items-center gap-3">
                <Image src={f.icon} alt="" width={18} height={18} aria-hidden className="dark:invert" />
                <h3 className="text-lg font-semibold">{f.title}</h3>
              </div>
              <p className="mt-2 text-[15px] text-[color:var(--color-muted)]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-12 lg:py-16">
        <div className="surface p-6">
          <h2 className="text-center">How it works</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "Create an account",
                body: "Choose your role (client or lawyer). We create a secure session for you.",
              },
              {
                step: "2",
                title: "Set your location",
                body: "Share your city or use precise geolocation for better matches.",
              },
              {
                step: "3",
                title: "Start chatting",
                body: "Find a lawyer, open a thread, and send your first message.",
              },
            ].map((s) => (
              <li key={s.step} className="card p-5">
                <div className="h-8 w-8 rounded-full bg-[color:var(--color-accent)] text-white grid place-items-center font-semibold">
                  {s.step}
                </div>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-[15px] text-[color:var(--color-muted)]">{s.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register" className="btn btn-primary h-11 px-6">
              Get started free
            </Link>
            <Link href="/app/lawyers" className="btn h-11 px-6">
              Explore lawyers
            </Link>
          </div>
        </div>
      </section>

      {/* AI Assist */}
      <section id="assist" className="mx-auto max-w-7xl px-6 py-12 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-2 items-center">
          <div>
            <h2>Upload a PDF, get instant structure</h2>
            <p className="mt-3 text-[15px] text-[color:var(--color-muted)]">
              The Assist page lets you paste text or upload a document. Your AI summary appears in seconds, so you and your lawyer
              can focus on decisions rather than decoding clauses.
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/app/assist" className="btn btn-primary h-11 px-6">
                Try AI Assist
              </Link>
              <Link href="/login" className="btn h-11 px-6">
                Sign in to continue
              </Link>
            </div>
          </div>

          <div className="card p-5">
            <div className="border border-[color:var(--color-border)] rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-[color:var(--color-border)] bg-[color:var(--color-panel)] text-sm">
                assist/session-123
              </div>
              <div className="p-4 space-y-3">
                <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3">
                  <p className="text-sm font-medium">Uploaded: tenant_agreement.pdf</p>
                  <p className="text-xs text-[color:var(--color-muted)] mt-1">Parsing 6 pages…</p>
                </div>
                <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-soft)] p-3">
                  <p className="text-sm">
                    <span className="font-semibold">Summary:</span> The agreement defines obligations on maintenance, late fees,
                    and termination with a 30-day notice. Key clause risks flagged in sections 4.3 and 6.1.
                  </p>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input className="h-11" placeholder="Ask about a clause…" aria-label="Ask AI Assist" />
                  <button className="btn btn-primary h-11 px-4">Ask</button>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-[color:var(--color-muted)]">Demo preview — actual answers require sign-in.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-7xl px-6 py-12 lg:py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h2>Frequently asked questions</h2>
          <p className="mt-3 text-[15px] text-[color:var(--color-muted)]">
            Short, straightforward answers as you get started.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[
            {
              q: "Is messaging secure?",
              a: "Yes. Each message is scoped to a client–lawyer pair and access is enforced by role-based auth.",
            },
            {
              q: "Do I need to set my location?",
              a: "It’s optional but recommended to discover nearby lawyers and show distances.",
            },
            {
              q: "What file types does Assist support?",
              a: "PDF uploads and raw text; summaries render in chat with markdown formatting.",
            },
            {
              q: "Can lawyers sign up too?",
              a: "Yes—choose the lawyer role during registration to access the lawyer dashboard.",
            },
          ].map((item) => (
            <div key={item.q} className="card p-5">
              <h3 className="font-semibold">{item.q}</h3>
              <p className="mt-1 text-[15px] text-[color:var(--color-muted)]">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-12 lg:py-16">
        <div className="surface p-6 text-center">
          <h2>Ready to begin?</h2>
          <p className="mt-2 text-[15px] text-[color:var(--color-muted)]">
            Create an account and start your first conversation in under a minute.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register" className="btn btn-primary h-11 px-6">
              Get started free
            </Link>
            <Link href="/login" className="btn h-11 px-6">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[color:var(--color-border)]">
        <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[color:var(--color-muted)]" >
            © {new Date().getFullYear()} Legal Assistant. All rights reserved.
          </p>
          
        </div>
      </footer>
    </div>
  );
}
