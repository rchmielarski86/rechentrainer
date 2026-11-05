// Immer zuerst das Netz, damit Änderungen sofort ankommen; ohne Netz aus dem Lager.
const LAGER = 'rechentrainer-1';
const DATEIEN = [
  './', 'index.html', 'bericht.html', 'kern.js', 'netz.js', 'manifest.webmanifest',
  'schrift/andika-400.woff2', 'schrift/andika-700.woff2',
  'symbole/symbol-180.png', 'symbole/symbol-192.png', 'symbole/symbol-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(LAGER).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function frisch(anfrage) {
  const lager = await caches.open(LAGER);
  try {
    const frist = new Promise((_, nein) => { setTimeout(nein, 2500); });
    const antwort = await Promise.race([fetch(anfrage), frist]);
    if (antwort.ok) lager.put(anfrage, antwort.clone());
    return antwort;
  } catch {
    return (await lager.match(anfrage, { ignoreSearch: true })) || Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method === 'GET' && new URL(e.request.url).origin === location.origin) e.respondWith(frisch(e.request));
});
