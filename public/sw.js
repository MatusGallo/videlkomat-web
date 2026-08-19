// Jednoduchý service worker pro Vydělkomat (PWA): offline app shell + instalace.
// Data zásahů/tankování řeší appka sama (localStorage + /api sync), proto
// API požadavky necachujeme.
const CACHE = "vk-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // API: vždy ze sítě, necachovat (data si drží appka v localStorage).
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  // Navigace = otevření appky: zkus síť, při výpadku vrať uloženou index.html.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Ostatní GET (JS/CSS/fonty/ikony): stale-while-revalidate.
  e.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          const cacheable =
            res && res.status === 200 &&
            (url.origin === self.location.origin ||
              url.hostname.endsWith("gstatic.com") ||
              url.hostname.endsWith("googleapis.com"));
          if (cacheable) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
