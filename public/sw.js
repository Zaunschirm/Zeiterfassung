// Vollständig deaktivierter Cache — keine Dateien werden gespeichert
// Manifest + Icons werden IMMER live geladen
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Alle alten Caches löschen (falls aus früheren Versionen vorhanden)
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    })
  );
  clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Nichts cachen → jede Anfrage direkt ins Netz
  return;
});
