import React, { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";

export default function NavBar({ onLogout, currentUser, role }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [gateBusy, setGateBusy] = useState(false);
  const [gateMessage, setGateMessage] = useState("");
  const [gatePinOpen, setGatePinOpen] = useState(false);
  const [gatePin, setGatePin] = useState("");
  const [gatePinError, setGatePinError] = useState("");
  const [gateMotionUntil, setGateMotionUntil] = useState(0);
  const [gateMotionSeconds, setGateMotionSeconds] = useState(0);
  const [gateStatus, setGateStatus] = useState({
    loading: false,
    state: "unknown",
    label: "Unbekannt",
    error: "",
    updatedAt: null,
  });
  const isAdmin = role === "admin";
  const canSeeAdmin = role === "admin" || role === "teamleiter";
  const isGateManager = role === "admin" || role === "teamleiter";
  const gateUrl = "http://192.168.1.106/rpc/Switch.Set?id=0&on=true&toggle_after=1";
  const gateLocalStatusUrl = "http://192.168.1.106/rpc/Switch.GetStatus?id=0";
  const isLocalPreview = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
  const gateCloudUrl = isLocalPreview ? "https://zeiterfassung-rho.vercel.app/api/shelly-gate" : "/api/shelly-gate";

  const initials = useMemo(() => {
    const name = currentUser?.name || "HB";
    return String(name)
      .split(" ")
      .map((p) => p[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [currentUser]);

  const mainLinks = [
    ...(isAdmin ? [{ to: "/dashboard", label: "Dashboard" }] : []),
    { to: "/zeiterfassung", label: "Zeiterfassung" },
    { to: "/arbeitseinteilung", label: "Arbeitseinteilung" },
    { to: "/regieberichte", label: "Regieberichte" },
    { to: "/bautagesberichte", label: "Bautagesberichte" },
    { to: "/lagerverwaltung", label: "Lagerverwaltung" },
    ...(isAdmin ? [{ to: "/abrechnung", label: "Abrechnung" }] : []),
  ];

  const moreLinks = [
    { to: "/urlaub", label: "Abwesenheiten" },
    { to: "/monatsuebersicht", label: "Monatsübersicht" },
    { to: "/projektfotos", label: "Projektfotos" },
  ];

  const adminLinks = [
    ...(canSeeAdmin ? [{ to: "/projekte", label: "Projekte" }] : []),
    ...(canSeeAdmin ? [{ to: "/mitarbeiter", label: "Mitarbeiter" }] : []),
    ...(isAdmin ? [{ to: "/jahresuebersicht", label: "Jahresübersicht" }] : []),
  ];

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!event.target?.closest?.(".app-nav-more")) setOpenMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (!gateMotionUntil) {
      setGateMotionSeconds(0);
      return undefined;
    }

    const updateMotionHint = () => {
      const seconds = Math.max(0, Math.ceil((gateMotionUntil - Date.now()) / 1000));
      setGateMotionSeconds(seconds);
      if (seconds <= 0) setGateMotionUntil(0);
    };

    updateMotionHint();
    const intervalId = window.setInterval(updateMotionHint, 250);
    return () => window.clearInterval(intervalId);
  }, [gateMotionUntil]);

  function startGateMotionHint() {
    setGateMotionUntil(Date.now() + 10000);
  }

  function normalizeGateState(value) {
    const state = String(value || "").toLowerCase();
    if (state === "open" || state === "offen") return "open";
    if (state === "closed" || state === "geschlossen") return "closed";
    return "unknown";
  }

  function gateStateLabel(state) {
    const normalizedState = normalizeGateState(state);
    if (normalizedState === "open") return "Offen";
    if (normalizedState === "closed") return "Geschlossen";
    return "Unbekannt";
  }

  function applyGateStatus(state, options = {}) {
    const normalizedState = normalizeGateState(state);
    const nextStatus = {
      loading: false,
      state: normalizedState,
      label: gateStateLabel(normalizedState),
      error: "",
      updatedAt: new Date().toISOString(),
      source: options.source || "shelly",
    };

    setGateStatus(nextStatus);

    return nextStatus;
  }

  function readShellyOutput(data) {
    if (typeof data?.output === "boolean") return data.output;
    if (typeof data?.["switch:0"]?.output === "boolean") return data["switch:0"].output;
    if (typeof data?.switch?.[0]?.output === "boolean") return data.switch[0].output;
    if (typeof data?.switch?.output === "boolean") return data.switch.output;
    return null;
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function loadLocalShellyStatus() {
    const response = await fetchWithTimeout(gateLocalStatusUrl, { method: "GET", cache: "no-store" }, 3500);
    const data = await response.json().catch(() => ({}));
    const output = readShellyOutput(data);
    if (output === null) throw new Error("Shelly-Status konnte lokal nicht gelesen werden.");
    applyGateStatus(output ? "open" : "closed", { source: "shelly-local" });
  }

  async function loadGateStatus() {
    try {
      setGateStatus((prev) => ({ ...prev, loading: true, error: "" }));

      if (currentUser?.gateToken) {
        const response = await fetchWithTimeout(gateCloudUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${currentUser.gateToken}`,
          },
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.ok === false) {
          throw new Error(result?.error || "Status nicht erreichbar.");
        }

        applyGateStatus(result?.state || "unknown", { source: result?.source || "shelly" });
        return;
      }

      await loadLocalShellyStatus();
    } catch (error) {
      console.warn("[NavBar] gate status error:", error);
      setGateStatus((prev) => ({
        ...prev,
        loading: false,
        state: normalizeGateState(prev.state),
        label: gateStateLabel(prev.state),
        error: error?.message || "Status nicht erreichbar.",
      }));
    }
  }

  useEffect(() => {
    loadGateStatus();
    const intervalId = window.setInterval(loadGateStatus, 30000);
    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.gateToken, currentUser?.code]);

  const renderNavLink = (to, label) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) =>
        `app-nav-btn${isActive ? " app-nav-btn-active" : ""}`
      }
      onClick={() => {
        setMobileOpen(false);
        setOpenMenu(null);
      }}
    >
      <span className="app-nav-label">{label}</span>
    </NavLink>
  );

  async function triggerSlidingGate() {
    if (gateBusy) return;
    setGateMessage("");
    setGatePinError("");

    if (!isGateManager && !window.confirm("Schiebetor wirklich auslösen? Bitte vorher Sichtkontakt prüfen.")) return;

    if (window.location.protocol === "https:") {
      if (isGateManager) {
        await triggerSlidingGateCloud();
        return;
      }

      setGatePin("");
      setGatePinOpen(true);
      return;
    }

    try {
      setGateBusy(true);
      await fetchWithTimeout(gateUrl, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
      }, 5000);
      setGateMessage("Schiebetor-Impuls gesendet.");
      startGateMotionHint();
      window.setTimeout(loadGateStatus, 1200);
      window.setTimeout(() => setGateMessage(""), 3500);
    } catch (error) {
      console.error("[NavBar] Shelly gate error:", error);
      setGateMessage("Schiebetor nicht erreichbar.");
      alert(`Schiebetor konnte nicht ausgelöst werden. ${error?.message || "Bitte prüfen: Shelly online und Cloud verbunden."}`);
    } finally {
      setGateBusy(false);
    }
  }

  async function triggerSlidingGateCloud(event) {
    event?.preventDefault?.();
    if (gateBusy) return;

    const pin = gatePin.trim();
    if (!isGateManager && !pin) {
      setGatePinError("Bitte Tor-PIN eingeben.");
      return;
    }

    try {
      setGateBusy(true);
      setGatePinError("");

      const response = await fetchWithTimeout(gateCloudUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: currentUser?.gateToken ? `Bearer ${currentUser.gateToken}` : "",
        },
        body: JSON.stringify({
          pin: isGateManager ? "" : pin,
          user: currentUser?.name || currentUser?.code || "unbekannt",
        }),
      }, 9000);

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error || "Shelly Cloud konnte nicht schalten.");
      }

      applyGateStatus(result?.gateStatus?.state || "unknown", { source: result?.gateStatus?.source || "shelly" });
      setGatePin("");
      setGatePinOpen(false);
      setGateMessage("Schiebetor-Impuls über Cloud gesendet.");
      startGateMotionHint();
      if (role === "admin" && "Notification" in window && Notification.permission === "granted") {
        new Notification("Schiebetor ausgelöst", {
          body: `${currentUser?.name || currentUser?.code || "Unbekannt"} hat das Schiebetor ausgelöst.`,
          icon: "/icons/icon-192.png",
        });
      }
      window.setTimeout(() => setGateMessage(""), 3500);
    } catch (error) {
      console.error("[NavBar] Shelly cloud gate error:", error);
      setGatePinError(error?.message || "Schiebetor nicht erreichbar.");
    } finally {
      setGateBusy(false);
    }
  }

  async function correctGateStatus(nextState) {
    if (!isAdmin) return;

    if (!window.confirm(`Torstatus wirklich auf "${gateStateLabel(nextState)}" setzen?`)) return;

    try {
      setGateMessage("");

      if (window.location.protocol === "https:" && currentUser?.gateToken) {
        const response = await fetchWithTimeout(`${gateCloudUrl}?action=status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentUser.gateToken}`,
          },
          body: JSON.stringify({ state: nextState }),
        }, 9000);
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.ok === false) {
          throw new Error(result?.error || "Status konnte nicht gespeichert werden.");
        }
        applyGateStatus(result?.gateStatus?.state || nextState, { source: result?.gateStatus?.source || "admin" });
      } else {
        applyGateStatus(nextState, { source: "admin-lokal" });
      }

      setGateMessage(`Torstatus auf ${gateStateLabel(nextState)} gesetzt.`);
      window.setTimeout(() => setGateMessage(""), 3000);
    } catch (error) {
      console.error("[NavBar] gate status correction error:", error);
      setGateMessage(error?.message || "Torstatus konnte nicht gespeichert werden.");
    }
  }

  const renderGateButton = () => (
    <button
      type="button"
      className="hbz-btn app-gate-top-button"
      onClick={triggerSlidingGate}
      disabled={gateBusy}
      title="Schiebetor per Shelly-Impuls auslösen"
    >
      {gateBusy ? "Tor wird ausgelöst…" : "Tor öffnen / schließen"}
    </button>
  );

  return (
    <>
      <nav className="app-nav" aria-label="Hauptnavigation">
        <div className="app-nav-left">
          <div className="app-logo-circle">
            <span>HZ</span>
          </div>
          <div className="app-title">
            <div className="app-title-main">Holzbau Zaunschirm</div>
            <div className="app-title-sub">Zeiterfassung</div>
          </div>
        </div>

        <div className="app-nav-center">
          {mainLinks.map((link) => renderNavLink(link.to, link.label))}
          <details className="app-nav-more" open={openMenu === "more"}>
            <summary className="app-nav-btn" onClick={(event) => { event.preventDefault(); setOpenMenu((value) => value === "more" ? null : "more"); }}>Mehr</summary>
            <div className="app-nav-dropdown">
              {moreLinks.map((link) => renderNavLink(link.to, link.label))}
            </div>
          </details>
          {adminLinks.length > 0 && (
            <details className="app-nav-more" open={openMenu === "admin"}>
              <summary className="app-nav-btn" onClick={(event) => { event.preventDefault(); setOpenMenu((value) => value === "admin" ? null : "admin"); }}>Verwaltung</summary>
              <div className="app-nav-dropdown">
                {adminLinks.map((link) => renderNavLink(link.to, link.label))}
              </div>
            </details>
          )}
        </div>

        <div className="app-nav-right">
          <div className="app-user-badge">
            <div className="app-user-initial">{initials}</div>
            <span className="app-user-name">
              {currentUser?.name || "Eingeloggt"}
              {role ? ` (${role})` : ""}
            </span>
          </div>

          <button type="button" className="hbz-btn" onClick={onLogout}>
            Logout
          </button>
        </div>

        <button
          type="button"
          className="app-nav-mobile-toggle"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          aria-label={mobileOpen ? "Menü schließen" : "Menü öffnen"}
        >
          {mobileOpen ? "Schließen" : "Menü"}
        </button>
      </nav>

      {mobileOpen && (
        <div className="app-nav-menu-mobile" id="mobile-navigation">
          <div className="app-nav-menu-mobile-row">
            {mainLinks.map((link) => renderNavLink(link.to, link.label))}
            {moreLinks.map((link) => renderNavLink(link.to, link.label))}
            {adminLinks.length > 0 && <div className="app-nav-mobile-heading">Verwaltung</div>}
            {adminLinks.map((link) => renderNavLink(link.to, link.label))}
            <button type="button" className="app-nav-btn" onClick={onLogout}>
              <span className="app-nav-label">Logout</span>
            </button>
          </div>
        </div>
      )}

      <div className="app-gate-quickbar" aria-label="Schiebetor Schnellzugriff">
        <div>
          <span>Torsteuerung</span>
          <small>Shelly 1 Gen4 · Impuls 1 Sekunde</small>
        </div>
        {renderGateButton()}
        {gateMotionSeconds > 0 && (
          <span className="app-gate-motion-hint">
            Tor bewegt sich · vor wenigen Sekunden ausgelöst · {gateMotionSeconds}s
          </span>
        )}
        <button
          type="button"
          className={`app-gate-status app-gate-status-${gateStatus.state}`}
          onClick={loadGateStatus}
          title="Torstatus aktualisieren"
        >
          <span>{gateStatus.loading ? "Prüfe…" : `Status: ${gateStatus.label}`}</span>
          <small>{gateStatus.error ? "nicht synchron" : "Tor-Zählstatus"}</small>
        </button>
        {isAdmin && (
          <div className="app-gate-admin-correction" aria-label="Torstatus korrigieren">
            <button type="button" onClick={() => correctGateStatus("open")}>als offen setzen</button>
            <button type="button" onClick={() => correctGateStatus("closed")}>als geschlossen setzen</button>
          </div>
        )}
        {gateMessage && <span className="app-gate-message">{gateMessage}</span>}
      </div>

      {gatePinOpen && (
        <div className="app-gate-modal-backdrop" role="presentation">
          <form className="app-gate-modal" onSubmit={triggerSlidingGateCloud}>
            <h2>Tor-PIN eingeben</h2>
            <p>Der Shelly wird über die Cloud ausgelöst. Bitte nur bei Sichtkontakt schalten.</p>
            <input
              autoFocus
              inputMode="numeric"
              type="password"
              value={gatePin}
              onChange={(event) => {
                setGatePin(event.target.value);
                setGatePinError("");
              }}
              placeholder="PIN"
              aria-label="Tor-PIN"
            />
            {gatePinError && <div className="app-gate-pin-error">{gatePinError}</div>}
            <div className="app-gate-modal-actions">
              <button
                type="button"
                className="hbz-btn secondary"
                onClick={() => {
                  setGatePinOpen(false);
                  setGatePin("");
                  setGatePinError("");
                }}
                disabled={gateBusy}
              >
                Abbrechen
              </button>
              <button type="submit" className="hbz-btn" disabled={gateBusy}>
                {gateBusy ? "Wird ausgelöst…" : "Tor auslösen"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
