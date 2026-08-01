import { GENERATED_APP_VERSION } from "./generatedVersion";

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

export const APP_VERSION =
  GENERATED_APP_VERSION && GENERATED_APP_VERSION !== "dev"
    ? GENERATED_APP_VERSION
    : import.meta.env.VITE_APP_VERSION || buildFallbackVersion();
