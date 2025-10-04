const CACHE='zeit-pwa-v33';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./config.json','./manifest.json','./assets/logo.png','./icons/icon-192.png','./icons/icon-512.png','users/','users/index.html'])));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});