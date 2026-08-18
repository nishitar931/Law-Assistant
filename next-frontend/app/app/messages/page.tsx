"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Role = "client" | "lawyer";
type MeResponse = { user: { id: number; email: string; role: Role } };
type Partner = {
  id: number;
  email: string;
  role: Role;
  location_name: string | null;
  location_lat: number | null;
  location_lon: number | null;
  last_message: string;
  last_at: string;
  last_sender_id: number;
};
type PartnersResponse = { partners: Partner[] };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function getTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function MessagesHome() {
  const [me, setMe] = useState<MeResponse["user"] | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const token = getTokenFromCookie();
      if (!token) {
        window.location.href = "/login";
        return;
      }
      try {
        // who am i
        const meRes = await fetch(`${API_URL}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.status === 401) {
          window.location.href = "/login";
          return;
        }
        const meJson = (await meRes.json()) as MeResponse;
        if (!alive) return;
        setMe(meJson.user);

        // partners
        const pRes = await fetch(`${API_URL}/messages/partners?limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const pJson = (await pRes.json()) as PartnersResponse | { error: string };
        if (!pRes.ok) throw new Error((pJson as any)?.error || "Failed to load conversations");
        if (!alive) return;
        setPartners((pJson as PartnersResponse).partners || []);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load conversations");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const x = q.trim().toLowerCase();
    if (!x) return partners;
    return partners.filter(p =>
      p.email.toLowerCase().includes(x) ||
      (p.location_name || "").toLowerCase().includes(x) ||
      (p.last_message || "").toLowerCase().includes(x)
    );
  }, [q, partners]);

  if (loading) {
    return (
      <div className="grid gap-3">
        <div className="skeleton h-10" />
        <div className="skeleton h-[60vh]" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="surface p-6">
        <h2 className="font-semibold">Messages</h2>
        <p className="text-sm text-[color:var(--color-muted)] mt-1">{err}</p>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4">
      {/* Sidebar */}
      <aside className="surface p-0 overflow-hidden h-[calc(100vh-140px)]">
        <div className="p-3 border-b border-[color:var(--color-border)]">
          <input
            placeholder="Search conversations…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 w-full"
          />
        </div>

        <div className="overflow-y-auto max-h-[calc(100vh-190px)]">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-[color:var(--color-muted)]">
              No conversations yet.
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--color-border)]">
              {filtered.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/app/messages/${p.id}`}
                    className="flex items-start gap-3 px-3 py-3 hover:bg-[color:var(--color-panel)]"
                  >
                    <div className="w-8 h-8 rounded-full bg-[color:var(--color-soft)] grid place-items-center text-sm font-semibold">
                      {(p.email?.[0] || "?").toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.email}</div>
                      <div className="text-2xs text-[color:var(--color-muted)] truncate">
                        {p.last_message || "No messages yet"}
                      </div>
                    </div>
                    <div className="ml-auto text-2xs text-[color:var(--color-muted)]">
                      {p.last_at ? new Date(p.last_at).toLocaleDateString() : ""}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-3 border-t border-[color:var(--color-border)]">
          <Link className="btn w-full" href="/app/lawyers">
            + Start a new chat
          </Link>
        </div>
      </aside>

      {/* Empty State / Guidance */}
      <section className="surface p-6 h-[calc(100vh-140px)] flex items-center justify-center text-center">
        <div>
          <h1 className="font-bold text-xl">Your messages</h1>
          <p className="mt-2 text-[color:var(--color-muted)]">
            Pick a conversation from the left or{" "}
            <Link href="/app/lawyers" className="underline underline-offset-4">find a lawyer</Link>{" "}
            to start chatting.
          </p>
        </div>
      </section>
    </div>
  );
}
