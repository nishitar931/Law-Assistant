// app/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Role = "client" | "lawyer";

interface MeResponse {
  user: { id: number; email: string; role: Role };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function getTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function AppHomePage() {
  const [me, setMe] = useState<MeResponse["user"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const token = getTokenFromCookie();
        if (!token) {
          window.location.href = "/login";
          return;
        }

        const res = await fetch(`${API_URL}/me`, {
          // IMPORTANT: send JWT to protected endpoint
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          // token missing/expired/invalid
          window.location.href = "/login";
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load session (${res.status})`);
        }

        const data = (await res.json()) as MeResponse;
        if (!alive) return;
        setMe(data.user);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Failed to load session");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="surface p-6">
        <h1 className="font-bold text-xl">Something went wrong</h1>
        <p className="mt-2 text-[color:var(--color-muted)]">
          {error ?? "Could not load your session."}
        </p>
        <div className="mt-4">
          <Link className="btn btn-primary" href="/login">
            Go to Sign in
          </Link>
        </div>
      </div>
    );
  }

  const isClient = me.role === "client";

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Welcome */}
      <section className="lg:col-span-2 surface p-6">
        <h1 className="font-black tracking-[-0.02em]">Welcome, {me.email}</h1>
        <p className="mt-2 text-[15px] text-[color:var(--color-muted)]">
          You’re signed in as <span className="font-medium">{me.role}</span>. Choose a task to get started.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {isClient ? (
            <>
              <div className="card p-5">
                <h3 className="text-lg font-semibold">Find a lawyer</h3>
                <p className="mt-1 text-[color:var(--color-muted)]">
                  Search nearby lawyers by city or radius.
                </p>
                <Link href="/app/lawyers" className="btn btn-primary mt-4">
                  Open directory
                </Link>
              </div>

              <div className="card p-5">
                <h3 className="text-lg font-semibold">Messages</h3>
                <p className="mt-1 text-[color:var(--color-muted)]">
                  Continue existing conversations or start a new one.
                </p>
                <Link href="/app/messages" className="btn mt-4">
                  Go to messages
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="card p-5">
                <h3 className="text-lg font-semibold">Inbox</h3>
                <p className="mt-1 text-[color:var(--color-muted)]">
                  View and respond to client messages.
                </p>
                <Link href="/app/messages" className="btn btn-primary mt-4">
                  Open inbox
                </Link>
              </div>

              <div className="card p-5">
                <h3 className="text-lg font-semibold">Set your location</h3>
                <p className="mt-1 text-[color:var(--color-muted)]">
                  Improve discoverability in the directory.
                </p>
                <Link href="/app/settings/profile" className="btn mt-4">
                  Update profile
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Quick actions */}
      <aside className="surface p-6 h-fit">
        <h2 className="text-lg font-semibold">Quick actions</h2>
        <div className="mt-3 grid gap-3">
          <Link href="/app/assist" className="btn w-full">
            AI Assist
          </Link>
          <Link href="/app/settings/profile" className="btn w-full">
            Profile settings
          </Link>
          {isClient && (
            <Link href="/app/lawyers" className="btn w-full">
              Discover lawyers
            </Link>
          )}
        </div>

        <hr className="my-6 border-[color:var(--color-border)]" />

        <h3 className="text-sm font-semibold">Tips</h3>
        <ul className="mt-2 list-disc list-inside text-sm text-[color:var(--color-muted)]">
          <li>Use location to sort nearby lawyers by distance.</li>
          <li>Upload a PDF in Assist to get a structured summary.</li>
          <li>Keep replies concise; timestamps help track context.</li>
        </ul>
      </aside>
    </div>
  );
}
