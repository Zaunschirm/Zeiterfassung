import React, { useEffect, useState } from "react";
import { APP_VERSION } from "../version";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function fetchLatestVersion() {
  const response = await fetch(`/app-version.json?t=${Date.now()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) return null;
  const data = await response.json();
  return String(data?.version || "");
}

export default function AppUpdateNotice() {
  const [latestVersion, setLatestVersion] = useState("");
  const [dismissedVersion, setDismissedVersion] = useState("");

  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    let cancelled = false;

    async function checkVersion() {
      try {
        const nextVersion = await fetchLatestVersion();
        if (!cancelled && nextVersion && nextVersion !== APP_VERSION) {
          setLatestVersion(nextVersion);
        }
      } catch (_) {
        // Offline oder temporär nicht erreichbar: still ignorieren.
      }
    }

    checkVersion();
    const intervalId = window.setInterval(checkVersion, CHECK_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkVersion();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", checkVersion);
    window.addEventListener("online", checkVersion);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", checkVersion);
      window.removeEventListener("online", checkVersion);
    };
  }, []);

  if (!latestVersion || dismissedVersion === latestVersion) return null;

  const reloadApp = () => {
    window.location.reload();
  };

  return (
    <div className="app-update-notice" role="status" aria-live="polite">
      <div>
        <b>Neue Version verfügbar</b>
        <span>Bitte neu laden, damit alle Änderungen sicher aktiv sind.</span>
      </div>
      <button type="button" onClick={reloadApp}>Aktualisieren</button>
      <button type="button" className="ghost" onClick={() => setDismissedVersion(latestVersion)} aria-label="Update-Hinweis ausblenden">×</button>
    </div>
  );
}
