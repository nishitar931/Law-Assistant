// app/components/AuthForm.tsx
"use client";

import { useState, useCallback, useEffect, useRef } from "react";

type Role = "client" | "lawyer";
type Variant = "login" | "register";

type Props =
  | { variant: "login" }
  | {
      variant: "register";
      defaultRole?: Role;
    };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/** Non-HttpOnly cookie so client can attach Bearer header to API calls. */
function setTokenCookie(token: string, maxAgeSeconds = 60 * 60 * 2) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  document.cookie = `token=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

/** Geocode a freeform location using OpenStreetMap Nominatim. */
async function geocodeLocationName(q: string): Promise<{ lat: number; lon: number } | null> {
  const query = q.trim();
  if (!query) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
    query
  )}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  return null;
}

export default function AuthForm(props: Props) {
  const { variant } = props;

  // Common fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Register-only fields
  const [role, setRole] = useState<Role>(
    variant === "register" ? props.defaultRole ?? "client" : "client"
  );
  const [locationName, setLocationName] = useState("");
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLon, setLocationLon] = useState<number | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  // Geocode UX
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [geocodeMsg, setGeocodeMsg] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // simple guards
  const isEmailValid = /\S+@\S+\.\S+/.test(email);
  const isPasswordValid = password.length >= 6;

  // Track last source of coords (gps | geocode) to avoid confusing flicker
  const lastSourceRef = useRef<"gps" | "geocode" | null>(null);

  /** Best-effort GPS on mount for register flow (silently ignored if denied). */
  useEffect(() => {
    if (variant !== "register") return;
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationLat(pos.coords.latitude);
        setLocationLon(pos.coords.longitude);
        lastSourceRef.current = "gps";
        setGeocodeMsg(`GPS set: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      },
      () => {
        /* ignore; user can type a location */
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [variant]);

  /** Manual GPS refresh */
  const handleGeolocate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationLat(pos.coords.latitude);
        setLocationLon(pos.coords.longitude);
        lastSourceRef.current = "gps";
        setGeoLoading(false);
        setGeocodeMsg(`GPS set: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      },
      (err) => {
        setGeoLoading(false);
        setError(err?.message || "Failed to get location.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  /** Auto-geocode typed location (debounced). Latest input wins over GPS. */
  useEffect(() => {
    if (variant !== "register") return;
    const q = locationName.trim();

    // If input cleared, don't geocode; keep current coords (GPS may be present)
    if (!q) {
      setGeocodeMsg(null);
      return;
    }

    // Debounce 600ms
    setGeocodeLoading(true);
    const t = setTimeout(async () => {
      try {
        const hit = await geocodeLocationName(q);
        if (hit) {
          setLocationLat(hit.lat);
          setLocationLon(hit.lon);
          lastSourceRef.current = "geocode";
          setGeocodeMsg(`Resolved: ${hit.lat.toFixed(4)}, ${hit.lon.toFixed(4)}`);
        } else {
          setGeocodeMsg("Could not resolve that place.");
        }
      } catch {
        setGeocodeMsg("Could not resolve that place.");
      } finally {
        setGeocodeLoading(false);
      }
    }, 600);

    return () => clearTimeout(t);
  }, [locationName, variant]);

  /** Submit */
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (variant === "login") {
        const res = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Login failed");
        setTokenCookie(data.token);
        window.location.assign("/app");
        return;
      }

      // REGISTER — MUST ALWAYS include lat/lon keys (nullable)
      // If user typed a location but debounce hasn’t finished yet, make one last attempt.
      let latToSend = locationLat;
      let lonToSend = locationLon;

      if ((latToSend == null || lonToSend == null) && locationName.trim()) {
        const hit = await geocodeLocationName(locationName);
        if (hit) {
          latToSend = hit.lat;
          lonToSend = hit.lon;
          setGeocodeMsg(`Resolved: ${hit.lat.toFixed(4)}, ${hit.lon.toFixed(4)}`);
        }
      }

      const payload = {
        email: email.trim().toLowerCase(),
        password,
        role,
        location_name: locationName || undefined, // optional string
        location_lat: latToSend, // may be null
        location_lon: lonToSend, // may be null
      };

      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Registration failed");

      setTokenCookie(data.token);
      window.location.assign("/app");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // Clear inline error when editing fields
  useEffect(() => {
    setError(null);
  }, [email, password, role, locationName]);

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md space-y-4">
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          aria-invalid={!isEmailValid && email.length > 0}
          className="h-11"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete={variant === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={variant === "login" ? "Your password" : "Min 6 characters"}
          required
          aria-invalid={!isPasswordValid && password.length > 0}
          className="h-11"
        />
        <p className="text-xs text-[color:var(--color-muted)]">
          {variant === "register" ? "Use at least 6 characters." : "Keep it secret, keep it safe."}
        </p>
      </div>

      {variant === "register" && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Choose your role</legend>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole("client")}
                aria-pressed={role === "client"}
                className={`btn ${role === "client" ? "btn-primary" : ""}`}
              >
                I’m a Client
              </button>
              <button
                type="button"
                onClick={() => setRole("lawyer")}
                aria-pressed={role === "lawyer"}
                className={`btn ${role === "lawyer" ? "btn-primary" : ""}`}
              >
                I’m a Lawyer
              </button>
            </div>
          </fieldset>

          <div className="space-y-1">
            <label htmlFor="location_name" className="text-sm font-medium">
              Location (optional)
            </label>
            <input
              id="location_name"
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="City or area (e.g., Indiranagar, Bangalore)"
              className="h-11"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn h-9 px-3"
                onClick={handleGeolocate}
                disabled={geoLoading}
              >
                {geoLoading ? "Locating…" : "Use my location"}
              </button>

              {(locationLat !== null && locationLon !== null) && (
                <span className="text-xs text-[color:var(--color-muted)]">
                  Set: {locationLat.toFixed(4)}, {locationLon.toFixed(4)}{" "}
                  {lastSourceRef.current ? `(${lastSourceRef.current})` : ""}
                </span>
              )}
            </div>

            {geocodeMsg && (
              <p className="text-xs text-[color:var(--color-muted)] mt-1">
                {geocodeLoading ? "Resolving…" : geocodeMsg}
              </p>
            )}
          </div>
        </>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border border-[color:var(--color-danger)]/40 bg-[color:var(--color-danger)]/10 px-3 py-2 text-sm"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !isEmailValid || !isPasswordValid}
        className="btn btn-primary w-full h-11"
      >
        {submitting
          ? variant === "login"
            ? "Signing in…"
            : "Creating account…"
          : variant === "login"
            ? "Sign in"
            : "Create account"}
      </button>

      <p className="text-center text-sm text-[color:var(--color-muted)]">
        {variant === "login" ? (
          <>
            Don’t have an account?{" "}
            <a className="underline underline-offset-4" href="/register">
              Create one
            </a>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <a className="underline underline-offset-4" href="/login">
              Sign in
            </a>
          </>
        )}
      </p>
    </form>
  );
}
