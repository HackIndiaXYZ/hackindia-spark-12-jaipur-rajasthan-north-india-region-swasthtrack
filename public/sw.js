/*
 * SwasthTrack service worker.
 *
 * Deliberately small. It does exactly two things:
 *   1. Shows /offline.html instead of the browser's dinosaur when a page
 *      navigation fails because the device is offline.
 *   2. Keeps same-origin, immutable STATIC files (hashed Next.js bundles, fonts,
 *      icons, logo) so repeat loads are fast.
 *
 * It must never hold health data. The app's data lives behind Supabase (a
 * different origin) and /api/*; both are out of reach of this worker on
 * purpose, and HTML pages are never cached either. Anything with an
 * Authorization header, any non-GET request and any cross-origin request is
 * passed straight to the network untouched.
 *
 * Registered only in production (see ServiceWorkerRegistration). Bump VERSION
 * to retire the old caches.
 */

const VERSION = "v2";
const PREFIX = "swasthtrack-";
const STATIC_CACHE = `${PREFIX}static-${VERSION}`;
const RUNTIME_CACHE = `${PREFIX}runtime-${VERSION}`;
const KNOWN_CACHES = [STATIC_CACHE, RUNTIME_CACHE];

const OFFLINE_URL = "/offline.html";
// Static brand assets only. No routes, no data.
const PRECACHE = [
  OFFLINE_URL,
  "/favicon.png",
  "/logo.jpg",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/apple-touch-icon.png",
];

const RUNTIME_MAX_ENTRIES = 120;

// Last-resort page if even the precached offline page is missing.
const FALLBACK_HTML =
  '<!doctype html><html lang="hi"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>SwasthTrack</title>" +
  '<body style="font-family:system-ui,sans-serif;text-align:center;padding:3rem 1.5rem;color:#14201d;background:#f5f7f6">' +
  "<h1>इंटरनेट नहीं है</h1><p>You are offline. Please reconnect and try again.</p>" +
  '<button onclick="location.reload()" style="font-size:1rem;padding:.75rem 1.25rem">फिर कोशिश करें</button>';

function offlineResponse() {
  return caches.match(OFFLINE_URL).then(
    (cached) =>
      cached ||
      new Response(FALLBACK_HTML, {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
  );
}

async function precache() {
  const cache = await caches.open(STATIC_CACHE);
  // The offline page is required: if it cannot be stored, fail the install so
  // the browser retries, instead of silently shipping a worker with no fallback.
  await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
  // The brand assets are best effort and never block the worker.
  await Promise.allSettled(
    PRECACHE.filter((url) => url !== OFFLINE_URL).map((url) => cache.add(url)),
  );
}

async function deleteOldCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith("swasthtrack") && !KNOWN_CACHES.includes(key))
      .map((key) => caches.delete(key)),
  );
}

async function trimCache(name, maxEntries) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  // keys() is in insertion order, so the oldest entries go first.
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    // Also removes the v1 worker's single cache, which stored every GET
    // response including cross-origin API data.
    deleteOldCaches().then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;

  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (type === "CLEAR_CACHES") {
    // Sent by sign-out. Static files are not private, but nothing from this
    // worker should outlive the session either, so everything goes; the
    // offline page is then put back so offline navigation still has a fallback.
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((key) => key.startsWith("swasthtrack")).map((key) => caches.delete(key))),
        )
        .then(() => precache())
        .catch(() => {}),
    );
  }
});

// Only same-origin, immutable static files are ever stored.
function isCacheableStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/logo.jpg" ||
    url.pathname === "/favicon.png"
  );
}

// Content-hashed files never change, so a cache hit is always right. Anything
// else (icons, logo) is served from cache and refreshed in the background.
function isHashed(url) {
  return url.pathname.startsWith("/_next/static/");
}

function storeIfSafe(event, request, response) {
  // Only complete, successful, same-origin responses; never partial (206) or
  // error responses, and never anything the server marked as private.
  const cacheControl = response.headers.get("Cache-Control") || "";
  if (
    response.status !== 200 ||
    response.type !== "basic" ||
    /no-store|private/i.test(cacheControl)
  ) {
    return;
  }
  const copy = response.clone();
  event.waitUntil(
    caches
      .open(RUNTIME_CACHE)
      .then((cache) => cache.put(request, copy))
      .then(() => trimCache(RUNTIME_CACHE, RUNTIME_MAX_ENTRIES))
      .catch(() => {}),
  );
}

async function staticResponse(event, request, url) {
  const cached = await caches.match(request);

  if (cached && isHashed(url)) return cached;

  const refresh = fetch(request)
    .then((response) => {
      storeIfSafe(event, request, response);
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Stale-while-revalidate: answer now, refresh behind the scenes.
    event.waitUntil(refresh);
    return cached;
  }

  const fresh = await refresh;
  return fresh || new Response("", { status: 504, statusText: "Offline" });
}

async function navigationResponse(request) {
  try {
    // HTML is never cached: it can be personalised and must always be current.
    return await fetch(request);
  } catch {
    return offlineResponse();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Everything below returns without calling respondWith, which hands the
  // request to the browser's normal network handling, untouched.
  if (request.method !== "GET") return;
  if (request.headers.has("Authorization")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase, any third party
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (isCacheableStatic(url)) {
    event.respondWith(staticResponse(event, request, url));
  }
});
