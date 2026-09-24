/* Verse Garden — offline service worker.
   Saves the app on the phone the first time it's opened online, then
   always loads from that saved copy, so it opens instantly with or
   without internet. When online it quietly downloads any newer
   version in the background; the update shows up the next time the
   app is opened. */
const CACHE = "verse-garden-v1";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isFont(url){
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Opening the app (any page load inside the site) → saved index.html,
  // refreshed in the background when there's internet.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = (await cache.match("./index.html")) || (await cache.match("./"));
      const network = fetch("./index.html", { cache: "no-cache" })
        .then(res => { if (res && res.ok) cache.put("./index.html", res.clone()); return res; })
        .catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      return (await network) || new Response("Offline — open once with internet first.", { status: 503, headers: { "Content-Type": "text/plain" } });
    })());
    return;
  }

  // App files and Google Fonts → saved copy first, updated in the background.
  if (url.origin === self.location.origin || isFont(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: url.origin === self.location.origin });
      const network = fetch(req)
        .then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      const res = await network;
      return res || new Response("", { status: 504 });
    })());
  }
});
