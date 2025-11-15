// Service Worker nur zum Aufräumen – keine Dateien werden gecached.
// Manifest & Icons werden immer frisch vom Server geladen.

self.addEventListener("install", (event) => {
  // sofort aktiv werden
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // alte Caches löschen (falls von älteren Versionen vorhanden)
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    })
  );
  clients.claim();
});

// kein eigenes Fetch-Handling -> Browser macht alles selbst
self.addEventListener("fetch", () => {
  return;
});
