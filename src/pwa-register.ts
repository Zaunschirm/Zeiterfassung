export function registerPWA() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')  // ggf. Dateiname anpassen, falls dein SW anders heißt
      .catch(() => {});
  });
}
