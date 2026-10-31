// Offline-Fähigkeit: App-Dateien werden zwischengespeichert. Wetterdaten speichert die App selbst.
// Bei Änderungen an der App VERSION erhöhen.
const VERSION = "klar-v1";
const SHELL = [
  "./", "index.html", "app.css", "manifest.webmanifest",
  "js/main.js", "js/api.js", "js/fmt.js", "js/sun.js", "js/sky.js", "js/icons.js", "js/views.js", "js/rabbits.js", "js/radar.js",
  "fonts/bricolage.woff2", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Wetterdienste und Karten immer live

  const isStatic = /\.(woff2|png|svg)$/.test(url.pathname) || url.pathname.includes("/vendor/");
  if (isStatic) {
    // Cache zuerst: ändert sich praktisch nie
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { put(req, res.clone()); return res; })));
    return;
  }
  // HTML, CSS, JS: Netz zuerst (immer aktuell), offline aus dem Cache
  e.respondWith(
    timeout(fetch(req), 4000)
      .then((res) => { if (res.ok) put(req, res.clone()); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html")))
  );
});

function put(req, res) { caches.open(VERSION).then((c) => c.put(req, res)).catch(() => {}); }
function timeout(p, ms) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then((v) => { clearTimeout(t); res(v); }, (err) => { clearTimeout(t); rej(err); }); }); }
