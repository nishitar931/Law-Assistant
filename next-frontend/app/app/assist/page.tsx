"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

// Markdown (GFM + code highlight)
const Markdown = dynamic(() => import("../../components/Markdown"), { ssr: false });

type Role = "client" | "lawyer";
type MeResponse = { user: { id: number; email: string; role: Role } };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) {
      try { return decodeURIComponent(p.slice(name.length + 1)); } catch { return p.slice(name.length + 1); }
    }
  }
  return null;
}
function getToken(): string | null {
  return getCookie("token") || (typeof window !== "undefined" ? window.localStorage.getItem("token") : null);
}
function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function pickAssistantReply(obj: any): string {
  if (!obj || typeof obj !== "object") return String(obj ?? "");
  return obj.answer ?? obj.text ?? obj.reply ?? obj.output ?? obj.content ?? obj.message ?? JSON.stringify(obj);
}

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  attachmentName?: string;
};

export default function AssistPage() {
  // Auth
  const [me, setMe] = useState<MeResponse["user"] | null>(null);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const token = getToken();
      if (!token) { window.location.href = "/login"; return; }
      try {
        const res = await fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } });
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.status === 401) { setAuthErr(body?.error || "Unauthorized"); setTimeout(()=>{window.location.href="/login"},300); return; }
        if (!res.ok) { setAuthErr(body?.error || `Failed to verify session (${res.status})`); return; }
        setMe((body as MeResponse).user);
      } catch (e:any) {
        if (!alive) return;
        setAuthErr(e?.message || "Could not reach API.");
      } finally {
        if (alive) setAuthChecked(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Chat state
  const [sessionId, setSessionId] = useState(uuid());
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Prompt selection
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);

  // “Thinking” and faux-stream typing
  const [thinkingId, setThinkingId] = useState<string | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const typingAbortRef = useRef<{ aborted: boolean; revealAll: boolean } | null>(null);
  const [isTyping, setIsTyping] = useState(false);

  // Attachments
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Layout
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, isTyping]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [input]);

  const canSend = useMemo(() => input.trim().length > 0 || !!file, [input, file]);

  function newChat() {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingAbortRef.current = { aborted: true, revealAll: true };
    setIsTyping(false);

    setMessages([]);
    setInput("");
    setFile(null);
    setSessionId(uuid());
    setThinkingId(null);
    setSelectedPrompt(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (/\.pdf$/i.test(f.name)) setFile(f);
    else { alert("Please upload a PDF."); e.currentTarget.value = ""; }
  }
  function removeFile() { setFile(null); }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); setDragActive(true); }
  function onDragLeave(e: React.DragEvent) { e.preventDefault(); setDragActive(false); }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f && /\.pdf$/i.test(f.name)) setFile(f);
    else if (f) alert("Please upload a PDF.");
  }

  function stopTyping(revealAll = true) {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingAbortRef.current = { aborted: true, revealAll };
    setIsTyping(false);
    setThinkingId(null);
  }

  async function send() {
    if (!canSend || sending || isTyping) return;
    const token = getToken();
    if (!token) { window.location.href = "/login"; return; }

    const content = input.trim();
    const nowIso = new Date().toISOString();

    const userMsg: ChatMsg = {
      id: uuid(),
      role: "user",
      content: content || (file ? `Uploaded ${file.name}` : ""),
      at: nowIso,
      attachmentName: file?.name,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setSelectedPrompt(null);

    const assistantId = uuid();
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", at: new Date().toISOString() }]);
    setThinkingId(assistantId);
    setIsTyping(false);

    setSending(true);
    try {
      let res: Response;
      if (file) {
        const fd = new FormData();
        fd.append("message", content || "");
        fd.append("session_id", sessionId);
        fd.append("user_pdf", file);
        res = await fetch(`${API_URL}/chat`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` } as any,
          body: fd,
        });
      } else {
        const body = { message: content || "Please analyze the attached document.", session_id: sessionId };
        res = await fetch(`${API_URL}/chat`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const j = await res.json();
      if (!res.ok) throw new Error((j as any)?.error || "Assist failed");

      const full = pickAssistantReply(j) || "";
      setFile(null);

      setThinkingId(null);
      setIsTyping(true);
      typingAbortRef.current = { aborted: false, revealAll: false };

      const words = full.split(/(\s+)/);
      let i = 0;

      const tick = () => {
        if (typingAbortRef.current?.aborted) {
          const showAll = typingAbortRef.current.revealAll;
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: showAll ? full : m.content } : m));
          setIsTyping(false);
          return;
        }

        const batchSize = 8;
        const next = words.slice(i, i + batchSize).join("");
        i += batchSize;

        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, content: m.content + next } : m))
        );

        if (i < words.length) {
          typingTimerRef.current = window.setTimeout(tick, 30);
        } else {
          setIsTyping(false);
        }
      };

      tick();
    } catch (e: any) {
      setThinkingId(null);
      setIsTyping(false);
      setMessages(prev => [
        ...prev,
        { id: uuid(), role: "assistant", content: e?.message || "Sorry, I couldn’t process that.", at: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Page header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-panel)] text-xs">
              🤖 AI Assist
            </div>
            <h1 className="mt-3 font-black tracking-[-0.02em]">How can I help today?</h1>
            <p className="text-[13px] text-[color:var(--color-muted)] mt-1">
              Upload a PDF or ask anything. I’ll reply with structured Markdown.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isTyping ? (
              <button className="btn h-9 px-3 text-xs" onClick={() => stopTyping(true)} title="Stop and reveal all">■ Stop</button>
            ) : (
              <button className="btn h-9 px-3 text-xs" onClick={newChat} title="Start a new conversation">+ New chat</button>
            )}
            <Link className="btn h-9 px-3 text-xs" href="/app">Home</Link>
          </div>
        </div>

        {/* Auth banner */}
        {authChecked && authErr && (
          <div className="surface p-3 mb-3 border border-[color:var(--color-danger)]/30 bg-[color:var(--color-danger)]/10 text-sm">
            <b>Session check:</b> {authErr}
          </div>
        )}

        {/* Chat panel */}
        <section className="surface p-0 overflow-hidden h-[calc(100vh-220px)] flex flex-col">
          <div
            ref={scrollRef}
            className={`flex-1 px-5 py-6 overflow-y-auto bg-[color:var(--color-page-fade)] transition-colors ${dragActive ? "ring-2 ring-[color:var(--color-accent)]" : ""}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {messages.length === 0 ? (
              <div className="mx-auto max-w-3xl text-center">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    "Summarize this legal document in plain English.",
                    "List all deadlines and parties involved.",
                    "Extract key clauses and potential risks.",
                    "Draft a professional reply email.",
                  ].map((t) => {
                    const isSelected = selectedPrompt === t;
                    return (
                      <button
                        key={t}
                        onClick={() => { setInput(t); setSelectedPrompt(t); }}
                        title="Use this prompt"
                        className={`p-3 text-left rounded-xl border transition-colors duration-200 cursor-pointer
                          ${isSelected
                            ? "bg-blue-100 border-blue-500 font-semibold"
                            : "bg-white border-gray-300 hover:border-blue-500"}`
                        }
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 p-6 border-2 border-dashed rounded-xl border-[color:var(--color-border)]">
                  <p className="text-sm">
                    Drag and drop a PDF here, or{" "}
                    <label className="underline underline-offset-4 cursor-pointer">
                      browse
                      <input type="file" accept="application/pdf" className="hidden" onChange={handleFilePick} />
                    </label>
                    .
                  </p>
                  <p className="text-xs text-[color:var(--color-muted)] mt-1">
                    I’ll parse it and answer with a concise summary.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl grid gap-4">
                {messages.map((m) => {
                  const mine = m.role === "user";
                  const isThinkingBubble = thinkingId && m.id === thinkingId && !m.content;
                  return (
                    <div key={m.id} className="flex">
                      <div
                        className={`rounded-2xl px-4 py-3 border max-w-[85%] ${
                          mine
                            ? "ml-auto bg-[color:var(--color-accent)]/15 border-[color:var(--color-accent)]/30"
                            : "bg-[color:var(--color-panel)] border-[color:var(--color-border)]"
                        }`}
                      >
                        {m.attachmentName ? (
                          <div className="mb-2 text-xs px-2 py-1 rounded-md border border-[color:var(--color-border)] inline-block bg-[color:var(--color-soft)]">
                            📎 {m.attachmentName}
                          </div>
                        ) : null}

                        {mine ? (
                          <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.content}</div>
                        ) : isThinkingBubble ? (
                          <div className="flex items-center gap-2 text-sm">
                            <div className="flex items-center gap-1">
                              <span className="inline-block w-2 h-2 rounded-full bg-current/60 animate-bounce [animation-delay:-0ms]" />
                              <span className="inline-block w-2 h-2 rounded-full bg-current/60 animate-bounce [animation-delay:120ms]" />
                              <span className="inline-block w-2 h-2 rounded-full bg-current/60 animate-bounce [animation-delay:240ms]" />
                            </div>
                            <span className="opacity-70">Thinking…</span>
                          </div>
                        ) : (
                          <Markdown className="text-[15px] leading-relaxed">
                            {m.content || (isTyping ? "▍" : "")}
                          </Markdown>
                        )}

                        <div className="text-2xs text-[color:var(--color-muted)] mt-2 text-right">
                          {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="p-3 border-t border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
            <div className="mx-auto max-w-3xl">
              {file ? (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs px-2 py-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-soft)]">
                    📎 {file.name}
                  </div>
                  <button className="text-xs underline underline-offset-4" onClick={removeFile}>Remove</button>
                </div>
              ) : null}

              <div className="flex items-end gap-2">
                <label className="btn h-11 px-3 cursor-pointer" title="Attach PDF" aria-label="Attach PDF">
                  📎
                  <input type="file" accept="application/pdf" className="hidden" onChange={handleFilePick} />
                </label>

                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); setSelectedPrompt(null); }}
                  onKeyDown={onKeyDown}
                  placeholder={file ? "Add instructions for your PDF…" : "Ask anything… (Enter to send)"}
                  className="flex-1 min-h-[44px] max-h-[220px] resize-none"
                />

                {isTyping ? (
                  <button className="btn h-11 px-5" onClick={() => stopTyping(true)} title="Stop">Stop</button>
                ) : (
                  <button
                    className="btn btn-primary h-11 px-6"
                    onClick={send}
                    disabled={!canSend || sending}
                    title="Send"
                  >
                    {sending ? "Sending…" : "Send"}
                  </button>
                )}
              </div>

              <div className="mt-2 text-2xs text-[color:var(--color-muted)]">
                Enter to send · Shift+Enter for a new line
              </div>
            </div>
          </div>
        </section>

        <aside className="text-xs text-[color:var(--color-muted)] mt-3">
          Tip: Uploading a PDF switches to document-aware mode for that turn. Start a <b>New chat</b> to reset context.
        </aside>
      </div>
    </div>
  );
}
