/**
 * Shared abuse-control for the Gemini-backed edge functions. Files starting
 * with "_" are not routed by Vercel, so this is import-only.
 *
 *  - Origin/Referer allowlist: only the app's own pages (mishkat.qa والقديم quran.uts.qa، its
 *    Vercel aliases, and localhost in dev) may call these. Browsers always send
 *    Origin on cross-origin and on same-origin POST, so this blocks other-site
 *    abuse and no-Origin scripts/curl.
 *  - Best-effort per-IP rate limit (in-memory, per edge instance). Not a hard
 *    distributed limit — pair it with a Google Cloud budget alert on the key
 *    for a real ceiling — but it adds meaningful friction with zero infra.
 */
const ALLOWED_HOSTS = ["mishkat.qa", "www.mishkat.qa", "quran.uts.qa", "localhost", "127.0.0.1"];

function hostAllowed(host) {
  if (!host) return false;
  if (ALLOWED_HOSTS.includes(host)) return true;
  return host.endsWith(".vercel.app"); // preview/prod deploy aliases
}

function originHost(req) {
  const o = req.headers.get("origin") || req.headers.get("referer") || "";
  try {
    return o ? new URL(o).hostname : "";
  } catch {
    return "";
  }
}

const HITS = new Map(); // ip -> timestamps within the window
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function ipOf(req) {
  const xf = req.headers.get("x-forwarded-for") || "";
  return xf.split(",")[0].trim() || "unknown";
}

function deny(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json", ...(status === 429 ? { "retry-after": "60" } : {}) },
  });
}

/** Returns a Response to short-circuit with, or null if the request is allowed. */
export function guard(req) {
  if (!hostAllowed(originHost(req))) return deny(403, "forbidden");

  const ip = ipOf(req);
  const now = Date.now();
  const recent = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return deny(429, "rate limited — try again shortly");
  recent.push(now);
  HITS.set(ip, recent);
  // opportunistic cleanup so the map can't grow unbounded on a long-lived instance
  if (HITS.size > 5000) {
    for (const [k, v] of HITS) {
      if (!v.some((t) => now - t < WINDOW_MS)) HITS.delete(k);
    }
  }
  return null;
}
