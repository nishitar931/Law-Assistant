// app/app/messages/[withUserId]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Role = "client" | "lawyer";
type MeResponse = { user: { id: number; email: string; role: Role } };
type Msg = {
  id: number;
  client_id: number;
  lawyer_id: number;
  sender_id: number;
  message: string;
  created_at: string;
};
type ThreadResponse = { messages: Msg[] };
type Partner = {
  id: number;
  email: string;
  role: Role;
  location_name?: string | null;
  last_message: string;
  last_at: string;
  last_sender_id?: number;
};
type PartnersResponse = { partners: Partner[] };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function getTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function timeHM(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Sort helpers */
const byLastAtDesc = (a: Partner, b: Partner) =>
  new Date(b.last_at).getTime() - new Date(a.last_at).getTime();

/** Update (or insert) a partner preview locally and keep list sorted by recency. */
function upsertPartner(
  list: Partner[],
  patch: { id: number; email?: string; last_message: string; last_at: string; last_sender_id?: number }
) {
  const i = list.findIndex((p) => p.id === patch.id);
  if (i === -1) {
    const newItem: Partner = {
      id: patch.id,
      email: patch.email ?? `User ${patch.id}`,
      role: "lawyer", // role not used in the UI here; safe default
      last_message: patch.last_message,
      last_at: patch.last_at,
      last_sender_id: patch.last_sender_id,
    };
    return [newItem, ...list].sort(byLastAtDesc);
  }
  const next = [...list];
  next[i] = {
    ...next[i],
    last_message: patch.last_message,
    last_at: patch.last_at,
    last_sender_id: patch.last_sender_id ?? next[i].last_sender_id,
  };
  return next.sort(byLastAtDesc);
}

export default function ThreadPage() {
  const params = useParams<{ withUserId: string }>();
  const otherId = Number(params.withUserId);

  // me
  const [me, setMe] = useState<MeResponse["user"] | null>(null);

  // sidebar partners
  const [partners, setPartners] = useState<Partner[]>([]);
  const [q, setQ] = useState("");

  // chat
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");

  // DOM refs
  const listRef = useRef<HTMLDivElement | null>(null);

  // derived (hooks must stay top-level)
  const lastId = useMemo(() => (msgs.length ? msgs[msgs.length - 1].id : 0), [msgs]);

  // naïve other label (no /users/:id endpoint)
  const otherLabel = useMemo(() => {
    const firstFromOther = msgs.find((m) => (me ? m.sender_id !== me.id : false));
    return firstFromOther ? `User ${firstFromOther.sender_id}` : `User ${otherId}`;
  }, [msgs, me, otherId]);

  // auto-scroll bottom on new messages
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  // initial auth + partners + thread
  useEffect(() => {
    let alive = true;
    (async () => {
      const token = getTokenFromCookie();
      if (!token) {
        window.location.href = "/login";
        return;
      }
      try {
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

        const pRes = await fetch(`${API_URL}/messages/partners?limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const pJson = (await pRes.json()) as PartnersResponse | { error: string };
        if (!pRes.ok) throw new Error((pJson as any)?.error || "Failed to load conversations");
        if (!alive) return;
        setPartners((pJson as PartnersResponse).partners || []);

        const tRes = await fetch(
          `${API_URL}/messages/thread?with_user_id=${otherId}&limit=200`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const tJson = (await tRes.json()) as ThreadResponse | { error: string };
        if (!tRes.ok) throw new Error((tJson as any)?.error || "Failed to load thread");
        if (!alive) return;
        setMsgs((tJson as ThreadResponse).messages || []);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load chat");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [otherId]);

  // poll for new messages (dedupe + update sidebar preview)
  useEffect(() => {
    if (!me) return;
    const token = getTokenFromCookie();
    if (!token) return;
    let stop = false;

    function mergeUnique(prev: Msg[], fresh: Msg[]) {
      const seen = new Set(prev.map((m) => m.id));
      const merged = [...prev];
      for (const m of fresh) if (!seen.has(m.id)) merged.push(m);
      return merged;
    }

    async function tick() {
      try {
        const url = new URL(`${API_URL}/messages/thread`);
        url.searchParams.set("with_user_id", String(otherId));
        url.searchParams.set("limit", "200");
        if (lastId) url.searchParams.set("after_id", String(lastId));
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = (await res.json()) as ThreadResponse | { error: string };
        if (res.ok) {
          const fresh = (j as ThreadResponse).messages || [];
          if (fresh.length) {
            setMsgs((prev) => mergeUnique(prev, fresh));

            // update sidebar preview with the newest message from this thread
            const newest = fresh[fresh.length - 1];
            setPartners((prev) =>
              upsertPartner(prev, {
                id: otherId,
                last_message: newest.message,
                last_at: newest.created_at,
                last_sender_id: newest.sender_id,
              })
            );
          }
        }
      } catch {
        /* ignore transient errors */
      } finally {
        if (!stop) setTimeout(tick, 2500);
      }
    }

    const id = setTimeout(tick, 1500);
    return () => {
      stop = true;
      clearTimeout(id);
    };
  }, [me, otherId, lastId]);

  // send (no optimistic bubble; update thread + sidebar immediately)
  async function send() {
    const content = text.trim();
    if (!content) return;
    const token = getTokenFromCookie();
    if (!token) {
      window.location.href = "/login";
      return;
    }
    setSending(true);
    try {
      const nowIso = new Date().toISOString();

      const res = await fetch(`${API_URL}/messages/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to_user_id: otherId, message: content }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to send");
      setText("");

      // 1) Update sidebar immediately
      setPartners((prev) =>
        upsertPartner(prev, {
          id: otherId,
          last_message: content,
          last_at: nowIso,
          last_sender_id: me?.id,
        })
      );

      // 2) Refetch thread (pull real IDs & timestamps)
      const tRes = await fetch(
        `${API_URL}/messages/thread?with_user_id=${otherId}&limit=200`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const tJson = (await tRes.json()) as ThreadResponse;
      setMsgs(tJson.messages || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to send");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending) send();
    }
  }

  // filter sidebar
  const filteredPartners = useMemo(() => {
    const x = q.trim().toLowerCase();
    if (!x) return [...partners].sort(byLastAtDesc);
    return [...partners]
      .filter(
        (p) =>
          p.email.toLowerCase().includes(x) ||
          (p.last_message || "").toLowerCase().includes(x)
      )
      .sort(byLastAtDesc);
  }, [q, partners]);

  if (loading) {
    return (
      <div className="grid gap-3">
        <div className="skeleton h-10" />
        <div className="skeleton h-[60vh]" />
        <div className="skeleton h-12" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="surface p-6">
        <h2 className="font-semibold">Chat unavailable</h2>
        <p className="text-sm text-[color:var(--color-muted)] mt-1">{err}</p>
        <div className="mt-3 flex gap-2">
          <Link className="btn" href="/app/messages">Back to messages</Link>
          <Link className="btn" href="/app">Home</Link>
        </div>
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
          {filteredPartners.length === 0 ? (
            <div className="p-4 text-sm text-[color:var(--color-muted)]">No conversations yet.</div>
          ) : (
            <ul className="divide-y divide-[color:var(--color-border)]">
              {filteredPartners.map((p) => {
                const active = p.id === otherId;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/app/messages/${p.id}`}
                      className={`flex items-start gap-3 px-3 py-3 hover:bg-[color:var(--color-panel)] ${
                        active ? "bg-[color:var(--color-panel)]" : ""
                      }`}
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
                );
              })}
            </ul>
          )}
        </div>
        <div className="p-3 border-t border-[color:var(--color-border)]">
          <Link className="btn w-full" href="/app/lawyers">
            + Start a new chat
          </Link>
        </div>
      </aside>

      {/* Chat */}
      <section className="surface p-0 h-[calc(100vh-140px)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[color:var(--color-border)] flex items-center justify-between">
          <div className="min-w-0">
            <div className="font-semibold truncate">{otherLabel}</div>
            <div className="text-xs text-[color:var(--color-muted)]">Direct chat</div>
          </div>
          <Link className="btn h-8 px-3 text-xs" href="/app/messages">All conversations</Link>
        </div>

        {/* Messages */}
        <div ref={listRef} className="px-4 py-4 flex-1 overflow-y-auto bg-[color:var(--color-page-fade)]">
          {msgs.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">No messages yet. Say hello 👋</p>
          ) : (
            <div className="grid gap-2">
              {msgs.map((m) => {
                const mine = m.sender_id === me?.id;
                return (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      mine
                        ? "ml-auto bg-[color:var(--color-accent)]/15 border border-[color:var(--color-accent)]/30"
                        : "bg-[color:var(--color-panel)] border border-[color:var(--color-border)]"
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.message}</div>
                    <div className="text-2xs text-[color:var(--color-muted)] mt-1 text-right">
                      {timeHM(m.created_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="p-3 border-t border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <div className="flex gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
              className="flex-1 h-12 resize-none"
            />
            <button
              className="btn btn-primary h-12 px-5"
              onClick={send}
              disabled={sending || !text.trim()}
              title="Send"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
