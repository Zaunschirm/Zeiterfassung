function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getQuery(req) {
  try {
    const url = new URL(req.url || "", "https://app.local");
    return url.searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function timingSafeEqualText(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (!a || !b || a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function getSupabaseConfig() {
  return {
    url: process.env.VITE_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  };
}

async function supabaseFetch(path, options = {}) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) throw new Error("Supabase Server-Konfiguration fehlt.");

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(typeof data === "string" ? data : data?.message || "Supabase-Abfrage fehlgeschlagen.");
  }

  return data;
}

function normalizeGateState(value) {
  const state = String(value || "").trim().toLowerCase();
  return state === "open" || state === "offen" ? "open" : "closed";
}

function gateStateLabel(state) {
  return normalizeGateState(state) === "open" ? "Offen" : "Geschlossen";
}

async function getStoredGateState() {
  try {
    const data = await supabaseFetch("app_state?select=key,value&key=eq.gate_status&limit=1");
    const row = Array.isArray(data) ? data[0] : null;
    const value = row?.value || {};
    const state = normalizeGateState(value?.state || "closed");
    return {
      state,
      label: gateStateLabel(state),
      source: value?.source || "app",
      lastImpulseAt: value?.last_impulse_at || null,
      lastTriggeredBy: value?.last_triggered_by || null,
      lastTriggeredRole: value?.last_triggered_role || null,
      lastActionLabel: value?.last_action_label || null,
      updated_at: value?.updated_at || null,
    };
  } catch (error) {
    console.warn("[shelly-gate-event] stored status fallback:", error);
    return { state: "closed", label: "Geschlossen", source: "fallback", lastImpulseAt: null, lastTriggeredBy: null, lastTriggeredRole: null, lastActionLabel: null, updated_at: null };
  }
}

async function saveStoredGateState(state, options = {}) {
  const normalizedState = normalizeGateState(state);
  const now = new Date().toISOString();
  const value = {
    state: normalizedState,
    label: gateStateLabel(normalizedState),
    source: options.source || "shelly",
    last_impulse_at: options.lastImpulseAt || null,
    last_triggered_by: options.triggeredBy || "Shelly App / externer Schalter",
    last_triggered_role: options.triggeredRole || "extern",
    last_action_label: options.actionLabel || `${gateStateLabel(normalizedState)} gesetzt`,
    updated_at: now,
  };

  await supabaseFetch("app_state?on_conflict=key", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      key: "gate_status",
      value,
      updated_at: now,
    }),
  });

  return value;
}

async function registerGateImpulse(source = "shelly", options = {}) {
  const currentGateStatus = await getStoredGateState();
  const lastImpulseAt = currentGateStatus.lastImpulseAt ? new Date(currentGateStatus.lastImpulseAt).getTime() : 0;
  const now = Date.now();

  if (lastImpulseAt && now - lastImpulseAt < 2500) {
    return {
      ...currentGateStatus,
      duplicateIgnored: true,
      source: currentGateStatus.source || source,
    };
  }

  const nextGateState = currentGateStatus.state === "open" ? "closed" : "open";
  return saveStoredGateState(nextGateState, {
    source,
    lastImpulseAt: new Date(now).toISOString(),
    triggeredBy: options.triggeredBy || "Shelly App / externer Schalter",
    triggeredRole: options.triggeredRole || "extern",
    actionLabel: nextGateState === "open" ? "Tor geöffnet" : "Tor geschlossen",
  });
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, error: "Nur GET oder POST erlaubt." });
  }

  const secret = process.env.SHELLY_GATE_EVENT_SECRET;
  const query = getQuery(req);
  const providedSecret = query.get("secret") || req.headers["x-gate-secret"];

  if (!secret) {
    return json(res, 500, { ok: false, error: "Shelly Event-Schlüssel fehlt." });
  }

  if (!timingSafeEqualText(providedSecret, secret)) {
    return json(res, 401, { ok: false, error: "Shelly Event-Schlüssel ist falsch." });
  }

  try {
    const gateStatus = await registerGateImpulse("shelly", {
      triggeredBy: "Shelly App / externer Schalter",
      triggeredRole: "extern",
    });
    return json(res, 200, { ok: true, gateStatus });
  } catch (error) {
    console.error("[shelly-gate-event] error:", error);
    return json(res, 502, {
      ok: false,
      error: error?.message || "Shelly Ereignis konnte nicht gespeichert werden.",
    });
  }
}
