// src/version.js
// Version + Zeitstempel für die Anzeige im Footer

function buildFallbackVersion() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");

  return (
    "dev " +
    d.getFullYear() +
    "." +
    pad(d.getMonth() + 1) +
    "." +
    pad(d.getDate()) +
    " – " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds())
  );
}

/**
 * APP_VERSION:
 * - In Produktion: Wert aus VITE_APP_VERSION (z. B. "1.0.3 – 14.11.2025 12:45")
 * - Lokal/ohne Env: "dev JJJJ.MM.TT – hh:mm:ss"
 */
export const APP_VERSION =
  import.meta.env.VITE_APP_VERSION || buildFallbackVersion();
