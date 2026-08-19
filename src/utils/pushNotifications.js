export function arePushNotificationsSupported() {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function getServiceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

function detectPlatform() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  return "Browser";
}

export async function savePushSubscription({ employeeId, employeeName, authToken, registerUrl }) {
  if (!employeeId) throw new Error("Mitarbeiter-ID fehlt.");
  if (!arePushNotificationsSupported()) throw new Error("Push wird auf diesem Gerät/Browser nicht unterstützt.");
  if (!authToken) throw new Error("Bitte neu einloggen, damit dieses Gerät für Push gespeichert werden kann.");

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) throw new Error("VITE_VAPID_PUBLIC_KEY fehlt in der Umgebung.");

  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Push-Benachrichtigungen wurden nicht erlaubt.");

  const registration = await getServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const json = subscription.toJSON();
  const platform = detectPlatform();
  const response = await fetch(registerUrl || "/api/push-register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      employee_id: employeeId,
      employee_name: employeeName || null,
      endpoint: subscription.endpoint,
      p256dh: json?.keys?.p256dh || "",
      auth: json?.keys?.auth || "",
      device_name: platform,
      platform,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || "Push-Gerät konnte am Server nicht gespeichert werden.");
  }

  return subscription;
}
