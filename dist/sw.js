self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Zeiterfassung", body: event.data ? event.data.text() : "Neue Meldung" };
  }

  const title = data.title || "Zeiterfassung";
  const options = {
    body: data.body || "Neue Meldung",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    data: {
      url: data.url || "/zeiterfassung",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/zeiterfassung";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    })
  );
});
