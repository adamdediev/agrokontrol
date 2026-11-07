/* AgroKontrol service worker: офлайн-доступ к интерфейсу */
const VERSION = "ak-v1";
const SCOPE = self.registration.scope; // например https://user.github.io/repo/
const PAGES = ["", "login/", "clients/", "client/", "payments/", "calendar/", "reports/", "settings/", "reset/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.all(PAGES.map((p) => cache.add(new Request(SCOPE + p, { cache: "reload" })).catch(() => undefined))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!url.href.startsWith(SCOPE)) return; // Supabase и прочие домены не трогаем

  // статические файлы сборки — сначала кэш
  if (url.pathname.includes("/_next/static/") || /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // страницы и данные маршрутов — сначала сеть, при офлайне кэш
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => {
          if (hit) return hit;
          if (req.mode === "navigate") return caches.match(SCOPE, { ignoreSearch: true });
          return new Response("", { status: 504 });
        }),
      ),
  );
});
