// Minimaler Service Worker für PWA-Funktionalität
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  clients.claim();
});

self.addEventListener("fetch", (event) => {
  // optional: Anfragen einfach durchlassen
});
