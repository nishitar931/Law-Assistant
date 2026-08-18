// app/app/lawyers/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Role = "client" | "lawyer";
type User = {
  id: number;
  email: string;
  role: Role;
  location_name: string | null;
  location_lat: number | null;
  location_lon: number | null;
  created_at: string;
};
type Lawyer = User & { distance_km?: number };
type MeResponse = { user: { id: number; email: string; role: Role } };
type LawyersResponse = { lawyers: Lawyer[] };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function getTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// OpenStreetMap Nominatim geocode
async function geocodePlace(q: string): Promise<{ lat: number; lon: number } | null> {
  const query = q.trim();
  if (!query) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
    query
  )}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(data) || data.length === 0) return null;
  const lat = Number(data[0].lat);
  const lon = Number(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

// Parse radius like "10km", " 25 km", "100KM"
function parseRadiusFromQuery(q: string, fallback = 50): { radiusKm: number; stripped: string } {
  const m = q.match(/\b(\d{1,3})\s?km\b/i);
  if (!m) return { radiusKm: fallback, stripped: q };
  const radius = Math.min(500, Math.max(1, Number(m[1])));
  const stripped = q.replace(m[0], "").replace(/\s{2,}/g, " ").trim();
  return { radiusKm: radius, stripped };
}

// Very rough: avoid geocoding emails/pure IDs
function looksLikeEmailOrId(q: string) {
  return /@/.test(q) || /^[0-9]+$/.test(q);
}

export default function LawyersPage() {
  // ─── Gate ────────────────────────────────────────────────────────────────
  const [roleChecked, setRoleChecked] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const token = getTokenFromCookie();
      if (!token) {
        window.location.href = "/login";
        return;
      }
      try {
        const res = await fetch(`${API_URL}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const data = (await res.json()) as MeResponse;
        if (!alive) return;
        if (data.user.role !== "client") {
          window.location.href = "/app";
          return;
        }
        setRoleChecked(true);
      } catch (e: any) {
        if (!alive) return;
        setSessionError(e?.message || "Failed to verify session");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ─── Single “Wake up & use” search bar ──────────────────────────────────
  const [query, setQuery] = useState("");            // everything in one box
  const [radiusKm, setRadiusKm] = useState(50);      // auto-extracted from query if "xxkm" appears
  const [useGps, setUseGps] = useState(false);       // chip toggle
  const [coords, setCoords] = useState<{ lat: number | null; lon: number | null }>({ lat: null, lon: null });
  const [geoBusy, setGeoBusy] = useState(false);

  // track where coords came from (gps | geocode) — helps messages
  const coordSourceRef = useRef<"gps" | "geocode" | null>(null);

  // debounce tick for searching
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setTick((x) => x + 1), 500);
    return () => clearTimeout(t);
  }, [query, useGps, radiusKm, coords.lat, coords.lon]);

  // GPS handling
  const ensureGps = async () => {
    if (!("geolocation" in navigator)) {
      throw new Error("Geolocation not supported");
    }
    setGeoBusy(true);
    return new Promise<void>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
          coordSourceRef.current = "gps";
          setGeoBusy(false);
          resolve();
        },
        (err) => {
          setGeoBusy(false);
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  };

  // Auto-extract radius & geocode from query
  const prepared = useMemo(() => parseRadiusFromQuery(query, radiusKm), [query, radiusKm]);
  useEffect(() => {
    // If radius token was in text, sync slider/state
    if (prepared.radiusKm !== radiusKm) setRadiusKm(prepared.radiusKm);
  }, [prepared.radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps

  // If query looks like place words (not email/id), auto-geocode debounced
  const [geocodeHint, setGeocodeHint] = useState<string | null>(null);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  useEffect(() => {
    const q = prepared.stripped.trim();
    if (!q || looksLikeEmailOrId(q)) {
      setGeocodeHint(null);
      // don’t clear coords; GPS or previous geocode may still be valid
      return;
    }
    setGeocodeBusy(true);
    const t = setTimeout(async () => {
      try {
        const hit = await geocodePlace(q);
        if (hit) {
          setCoords({ lat: hit.lat, lon: hit.lon });
          coordSourceRef.current = "geocode";
          setGeocodeHint(`Near ${q} · ${hit.lat.toFixed(3)}, ${hit.lon.toFixed(3)}`);
        } else {
          setGeocodeHint("Couldn’t resolve that place");
        }
      } catch {
        setGeocodeHint("Couldn’t resolve that place");
      } finally {
        setGeocodeBusy(false);
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared.stripped]);

  // ─── Data ────────────────────────────────────────────────────────────────
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // First load: show everyone (no filters)
  useEffect(() => {
    if (!roleChecked) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const token = getTokenFromCookie();
        if (!token) {
          window.location.href = "/login";
          return;
        }
        const res = await fetch(`${API_URL}/lawyers?limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) throw new Error(`Failed to load lawyers (${res.status})`);
        const data = (await res.json()) as LawyersResponse;
        if (!alive) return;
        setLawyers(data.lawyers || []);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load lawyers");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [roleChecked]);

  // Perform search whenever debounced tick changes
  useEffect(() => {
    if (!roleChecked) return;
    let alive = true;
    (async () => {
      // If user toggled “Use my location” and no GPS yet, try to get it once
      if (useGps && (coords.lat == null || coords.lon == null)) {
        try {
          await ensureGps();
        } catch {
          // keep going; we’ll just search without coords
        }
      }

      try {
        setFetching(true);
        setErr(null);
        const token = getTokenFromCookie();
        if (!token) {
          window.location.href = "/login";
          return;
        }

        const params = new URLSearchParams();
        const q = prepared.stripped.trim();
        if (q) params.set("q", q);
        if (useGps && coords.lat != null && coords.lon != null) {
          params.set("lat", String(coords.lat));
          params.set("lon", String(coords.lon));
          params.set("radius_km", String(radiusKm));
        } else if (!useGps && coords.lat != null && coords.lon != null && !looksLikeEmailOrId(q) && q) {
          // Using auto-geocoded place coords
          params.set("lat", String(coords.lat));
          params.set("lon", String(coords.lon));
          params.set("radius_km", String(radiusKm));
        }
        params.set("limit", "200");

        const res = await fetch(`${API_URL}/lawyers?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = (await res.json()) as LawyersResponse | { error: string };
        if (!res.ok) throw new Error((j as any)?.error || `Failed to fetch lawyers (${res.status})`);
        if (!alive) return;
        setLawyers((j as LawyersResponse).lawyers || []);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to search");
      } finally {
        if (alive) setFetching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, roleChecked]);

  // ─── UI ─────────────────────────────────────────────────────────────────
  if (!roleChecked) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="surface p-6">
        <h2 className="font-semibold">Session error</h2>
        <p className="text-sm text-[color:var(--color-muted)] mt-1">{sessionError}</p>
        <div className="mt-3">
          <Link href="/login" className="btn btn-primary">Sign in again</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-black tracking-[-0.02em]">Find a Lawyer</h1>
          <p className="text-[15px] text-[color:var(--color-muted)]">
            Type anything — name, email, or a place like “Bangalore 25km”. Toggle GPS if you want strictly-near-me.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app/assist" className="btn">AI Assist</Link>
          <Link href="/app/settings/profile" className="btn">Profile</Link>
        </div>
      </div>

      {/* Smart Search Box */}
      <div className="surface p-4">
        <div className="grid gap-3">
          <div className="relative">
            <input
              id="smart-search"
              className="h-12 pl-11 pr-36 w-full"
              placeholder='       Search lawyers or places'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-70" aria-hidden>🔎</span>

            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  const next = !useGps;
                  setUseGps(next);
                  if (next && (coords.lat == null || coords.lon == null)) {
                    try {
                      await ensureGps();
                    } catch { /* ignore */ }
                  }
                }}
                className={`px-3 h-8 rounded-full text-xs border ${
                  useGps ? "btn-primary" : ""
                }`}
                title="Use my GPS location"
              >
                📍 {useGps ? "GPS On" : "GPS Off"}
              </button>
              <div className="flex items-center gap-1 text-xs px-2 h-8 rounded-full border bg-[color:var(--color-soft)]">
                <span>Radius</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Math.min(500, Math.max(1, Number(e.target.value || 0))))}
                  className="w-14 h-7 text-center bg-transparent outline-none"
                  title="Radius in km"
                />
                <span>km</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-[color:var(--color-muted)] flex items-center gap-3">
            {geoBusy ? <span>Fetching GPS…</span> : null}
            {geocodeBusy ? <span>Resolving place…</span> : null}
            {!geoBusy && !geocodeBusy && (coords.lat != null && coords.lon != null) ? (
              <span>
                Coordinates: {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
                {coordSourceRef.current ? ` (${coordSourceRef.current})` : ""}
              </span>
            ) : null}
            {geocodeHint && <span>· {geocodeHint}</span>}
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-32" />
          ))}
        </div>
      ) : err ? (
        <div className="surface p-4">
          <h2 className="font-semibold">Couldn’t load lawyers</h2>
          <p className="text-sm text-[color:var(--color-muted)] mt-1">{err}</p>
        </div>
      ) : lawyers.length === 0 ? (
        <div className="surface p-4">
          <p className="text-sm text-[color:var(--color-muted)]">
            No lawyers found. Try a broader radius (e.g., “50km”) or remove filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lawyers.map((L) => {
            const initials = (L.email?.[0] || "?").toUpperCase();
            return (
              <article key={L.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[color:var(--color-soft)] grid place-items-center font-semibold">
                      {initials}
                    </div>
                    <div>
                      <h3 className="font-semibold text-[15px] break-all">{L.email}</h3>
                      <p className="text-sm text-[color:var(--color-muted)]">
                        {L.location_name ?? "No location"}
                      </p>
                    </div>
                  </div>
                  {typeof L.distance_km === "number" && (
                    <span className="text-xs px-2 py-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-soft)] whitespace-nowrap">
                      {L.distance_km} km
                    </span>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/app/messages/${L.id}`}
                    className="btn btn-primary flex-1"
                    title={`Start chatting with ${L.email}`}
                  >
                    Connect
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Footer help */}
      <p className="text-xs text-[color:var(--color-muted)]">
        Pro tip: add “<span className="font-mono">30km</span>” to any place query, e.g., “<span className="font-mono">Koramangala 30km</span>”.
      </p>
    </div>
  );
}
