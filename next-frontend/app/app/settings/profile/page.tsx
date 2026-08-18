// app/app/settings/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppNav from "../../../components/AppNav";

type Role = "client" | "lawyer";
type MeResponse = { user: { id: number; email: string; role: Role } };
type User = {
  id: number;
  email: string;
  role: Role;
  location_name: string | null;
  location_lat: number | null;
  location_lon: number | null;
  created_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// ── Auth helpers ───────────────────────────────────────────────────────────
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function getToken(): string | null {
  return getCookie("token") || (typeof window !== "undefined" ? window.localStorage.getItem("token") : null);
}
function logoutAndRedirect() {
  if (typeof document !== "undefined") {
    document.cookie = `token=; Path=/; Max-Age=0; SameSite=Lax`;
  }
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("token");
    window.location.href = "/login";
  }
}

// ── Geocode helpers ────────────────────────────────────────────────────────
async function geocodePlace(q: string): Promise<{ lat: number; lon: number } | null> {
  const query = q.trim();
  if (!query) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!data?.length) return null;
  const lat = Number(data[0].lat), lon = Number(data[0].lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const j = await res.json().catch(() => ({}));
  return j?.display_name || null;
}

export default function ProfilePage() {
  // ── Session + profile load (READ-ONLY) ───────────────────────────────────
  const [me, setMe] = useState<MeResponse["user"] | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const token = getToken();
      if (!token) { logoutAndRedirect(); return; }
      try {
        // Who am I
        const meRes = await fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (meRes.status === 401) { logoutAndRedirect(); return; }
        const meJson = (await meRes.json()) as MeResponse;
        if (!alive) return;
        setMe(meJson.user);

        // Full user row — SAFE GET (no side-effects)
        const profRes = await fetch(`${API_URL}/me/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const profJ = await profRes.json().catch(() => ({}));
        if (!alive) return;

        if (profRes.ok && profJ?.user) {
          setUser(profJ.user as User);
        } else {
          // fallback minimal (shouldn't happen if endpoint exists)
          setUser({
            id: Number(meJson.user.id),
            email: meJson.user.email,
            role: meJson.user.role,
            location_name: null,
            location_lat: null,
            location_lon: null,
            created_at: new Date().toISOString(),
          });
        }
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load profile");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ── Editable fields (Saved location) ─────────────────────────────────────
  const [locName, setLocName] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // hydrate editor from user row (no network writes)
  useEffect(() => {
    if (!user) return;
    setLocName(user.location_name || "");
    setLat(user.location_lat);
    setLon(user.location_lon);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced geocode when typing a place — ONLY adjusts editor state
  useEffect(() => {
    const q = locName.trim();
    if (!q) { setNote(null); return; }
    setGeocodeBusy(true);
    const t = setTimeout(async () => {
      try {
        const hit = await geocodePlace(q);
        if (hit) {
          setLat(hit.lat);
          setLon(hit.lon);
          setNote(`Resolved: ${hit.lat.toFixed(4)}, ${hit.lon.toFixed(4)}`);
        } else {
          setNote("Could not resolve that place.");
        }
      } catch { setNote("Could not resolve that place."); }
      finally { setGeocodeBusy(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [locName]);

  async function save() {
    if (!me) return;
    const token = getToken();
    if (!token) { logoutAndRedirect(); return; }
    setSaveBusy(true);
    setErr(null);
    setNote(null);
    try {
      // PARTIAL PATCH — only the keys we send are updated
      const res = await fetch(`${API_URL}/me/location`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          location_name: locName || null,
          location_lat: lat,
          location_lon: lon,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Failed to save (${res.status})`);
      setUser(j.user);
      setNote("Saved ✓");
    } catch (e: any) {
      setErr(e?.message || "Failed to save");
    } finally {
      setSaveBusy(false);
    }
  }
  function resetEdits() {
    if (!user) return;
    setLocName(user.location_name || "");
    setLat(user.location_lat);
    setLon(user.location_lon);
    setNote(null);
  }

  // ── Device (GPS) snapshot — “location currently available on this device” ─
  const [devLat, setDevLat] = useState<number | null>(null);
  const [devLon, setDevLon] = useState<number | null>(null);
  const [devPlace, setDevPlace] = useState<string | null>(null);
  const [devBusy, setDevBusy] = useState(false);
  const [devCapturedAt, setDevCapturedAt] = useState<string | null>(null);

  async function captureDeviceLocation() {
    if (!("geolocation" in navigator)) {
      setDevPlace("Geolocation not supported.");
      return;
    }
    setDevBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const la = pos.coords.latitude, lo = pos.coords.longitude;
        setDevLat(la); setDevLon(lo);
        setDevCapturedAt(new Date().toISOString());
        try {
          const name = await reverseGeocode(la, lo);
          setDevPlace(name || `${la.toFixed(4)}, ${lo.toFixed(4)}`);
        } catch {
          setDevPlace(`${la.toFixed(4)}, ${lo.toFixed(4)}`);
        } finally {
          setDevBusy(false);
        }
      },
      (err) => {
        setDevBusy(false);
        setDevPlace(err?.message || "Could not get location.");
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  }

  // Attempt a snapshot on mount (never sent to backend automatically)
  useEffect(() => { captureDeviceLocation(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function useDeviceForProfile() {
    if (devLat == null || devLon == null) return;
    setLat(devLat);
    setLon(devLon);
    setLocName(devPlace || "");
    setNote("Using device location in editor (remember to Save).");
  }

  // ── Friendly string for “Saved location (used by default)” ───────────────
  const [savedPlace, setSavedPlace] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (lat == null || lon == null) { setSavedPlace(null); return; }
      try {
        const name = await reverseGeocode(lat, lon);
        if (!cancelled) setSavedPlace(name || null);
      } catch { if (!cancelled) setSavedPlace(null); }
    })();
    return () => { cancelled = true; };
  }, [lat, lon]);

  // ── UI ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-page">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <AppNav />
          <div className="mt-6 grid gap-3">
            <div className="skeleton h-10" />
            <div className="skeleton h-28" />
          </div>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-page">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <AppNav />
          <div className="surface p-6 mt-6">
            <h2 className="font-semibold">Profile unavailable</h2>
            <p className="text-sm text-[color:var(--color-muted)] mt-1">{err}</p>
            <div className="mt-3 flex gap-2">
              <Link href="/app" className="btn">Home</Link>
              <button onClick={logoutAndRedirect} className="btn">Log out</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const savedCoords = (lat != null && lon != null) ? `${lat.toFixed(4)}, ${lon.toFixed(4)}` : "—";

  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto max-w-5xl px-6 py-6">

        {/* “Currently used” banner — explicit and non-destructive */}
        <div className="mt-4 surface p-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-2 py-1 rounded-md border bg-[color:var(--color-soft)]">
              Currently used (app default): <b>Saved location</b>
            </span>
            <span className="text-[color:var(--color-muted)]">
              Pages like <b>Discover Lawyers</b> use your Saved location by default.
              Some pages may have a GPS toggle — enabling it uses your <b>current device location</b> for that page only.
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* Left: main editor */}
          <section className="surface p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-[color:var(--color-border)]">
              <h1 className="font-black tracking-[-0.02em]">Profile</h1>
              <p className="text-[13px] text-[color:var(--color-muted)]">Manage your account details & location.</p>
            </div>

            <div className="p-4 grid gap-5">
              {/* Identity */}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="field">
                  <label className="text-sm font-medium">Email</label>
                  <input value={user?.email || ""} disabled className="h-11 opacity-80" />
                </div>
                <div className="field">
                  <label className="text-sm font-medium">Role</label>
                  <input value={user?.role || ""} disabled className="h-11 opacity-80 capitalize" />
                </div>
              </div>

              {/* Saved location summary (what the app uses by default) */}
              <div className="surface p-3">
                <div className="text-sm">
                  <div className="font-medium">Saved location (used by default)</div>
                  <div className="mt-1 text-[color:var(--color-muted)]">
                    {savedPlace || user?.location_name || "—"}
                    {savedCoords !== "—" ? <> • <span className="font-mono">{savedCoords}</span></> : null}
                  </div>
                </div>
              </div>

              {/* Editor */}
              <div className="field">
                <label className="text-sm font-medium" htmlFor="locName">Update location</label>
                <input
                  id="locName"
                  className="h-11"
                  placeholder="City or area (e.g., Indiranagar, Bangalore)"
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                />
                <div className="mt-2 text-xs text-[color:var(--color-muted)]">
                  {geocodeBusy ? "Resolving…" :
                    (lat != null && lon != null ? <>Coords: {lat.toFixed(4)}, {lon.toFixed(4)}</> : "No coordinates yet")}
                  {note ? <> • {note}</> : null}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary h-11 px-5" onClick={save} disabled={saveBusy}>
                  {saveBusy ? "Saving…" : "Save changes"}
                </button>
                <button className="btn h-11 px-4" onClick={resetEdits}>Reset</button>
              </div>
            </div>
          </section>

          {/* Right: Device location + quick actions */}
          <aside className="surface p-4 h-max grid gap-4">
            <div>
              <div className="font-semibold">Device (GPS) location</div>
              <div className="mt-1 text-sm text-[color:var(--color-muted)]">
                {devBusy ? "Locating…" :
                  (devLat != null && devLon != null
                    ? <>
                        {devPlace || "—"} • <span className="font-mono">{devLat.toFixed(4)}, {devLon.toFixed(4)}</span>
                        {devCapturedAt ? <> <span className="opacity-70">(updated {new Date(devCapturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})</span></> : null}
                      </>
                    : "No device location yet")}
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn h-9 px-3" onClick={captureDeviceLocation} disabled={devBusy}>
                  {devBusy ? "Refreshing…" : "Refresh"}
                </button>
                <button className="btn h-9 px-3" onClick={useDeviceForProfile} disabled={devLat == null || devLon == null}>
                  Use this for profile
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <Link href="/app" className="btn">Back to app</Link>
              <button onClick={logoutAndRedirect} className="btn">Log out</button>
            </div>

            <div className="text-xs text-[color:var(--color-muted)] leading-relaxed">
              Tip: If you want “near me” results on Discover Lawyers, enable the GPS toggle there. Otherwise, the page uses your Saved location above.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
