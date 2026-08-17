import crypto from "node:crypto";
import webpush from "web-push";

const DEFAULT_DEVICE_ID = "e4b3233fd228";

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function normalizeHost(host) {
  return String(host || "").trim().replace(/\/+$/, "");
}

function getSessionSecret() {
  return process.env.APP_SESSION_SECRET || process.env.SHELLY_CLOUD_AUTH_KEY || "";
}

function verifySessionToken(req) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const secret = getSessionSecret();
  if (!token || !secret || !token.includes(".")) return null;

  const [encodedPayload, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  if (signature.length !== expected.length) return null;

  const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8"));
    if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2048) {
        reject(new Error("Anfrage zu groß."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Ungültige Anfrage."));
      }
    });
    req.on("error", reject);
  });
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

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:stefan.zaunschirm@gmx.at";

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function readSwitchOutputFromStatus(data, channel = 0) {
  const row = Array.isArray(data) ? data[0] : data;
  const status = row?.status || row?.data?.device_status || row?.device_status || {};
  const switchKey = `switch:${channel}`;

  if (typeof status?.[switchKey]?.output === "boolean") return status[switchKey].output;
  if (typeof status?.switch?.[channel]?.output === "boolean") return status.switch[channel].output;
  if (typeof status?.switch?.output === "boolean") return status.switch.output;
  if (typeof row?.output === "boolean") return row.output;

  return null;
}

async function getShellyGateStatus({ host, authKey, deviceId, channel }) {
  const response = await fetch(
    `${host}/v2/devices/api/get?auth_key=${encodeURIComponent(authKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: [deviceId],
        select: ["status"],
        pick: { status: [`switch:${channel}`, "sys", "cloud"] },
      }),
    }
  );

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(typeof data === "string" ? data : data?.error || "Shelly Status konnte nicht geladen werden.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  const output = readSwitchOutputFromStatus(data, channel);

  return {
    online: row?.online === 1 || row?.online === true,
    output,
    state: output === true ? "open" : output === false ? "closed" : "unknown",
    label: output === true ? "Offen" : output === false ? "Geschlossen" : "Unbekannt",
    raw: data,
  };
}

async function notifyAdminsAboutGate({ triggeredBy }) {
  if (!configureWebPush()) {
    return { attempted: false, sent: 0, reason: "VAPID-Schlüssel fehlen." };
  }

  const employees = await supabaseFetch("employees?select=id,name,role,active,disabled");
  const adminIds = (employees || [])
    .filter((employee) => {
      const role = String(employee?.role || "").trim().toLowerCase();
      return role === "admin" && employee?.disabled !== true && employee?.active !== false;
    })
    .map((employee) => String(employee.id));

  if (!adminIds.length) return { attempted: true, sent: 0, reason: "Keine Admins gefunden." };

  const subscriptions = await supabaseFetch("push_subscriptions?select=id,employee_id,employee_name,endpoint,p256dh,auth,push_enabled");
  const adminSubscriptions = (subscriptions || []).filter(
    (subscription) =>
      subscription?.push_enabled !== false &&
      adminIds.includes(String(subscription?.employee_id)) &&
      subscription?.endpoint &&
      subscription?.p256dh &&
      subscription?.auth
  );

  const payload = JSON.stringify({
    title: "Schiebetor ausgelöst",
    body: `${triggeredBy || "Unbekannt"} hat das Schiebetor geöffnet/geschlossen.`,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    url: "/dashboard",
  });

  let sent = 0;
  await Promise.allSettled(
    adminSubscriptions.map(async (subscription) => {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload
      );
      sent += 1;
    })
  );

  return { attempted: true, sent, total: adminSubscriptions.length };
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, error: "Nur GET oder POST erlaubt." });
  }

  const host = normalizeHost(process.env.SHELLY_CLOUD_HOST);
  const authKey = process.env.SHELLY_CLOUD_AUTH_KEY;
  const gatePin = process.env.SHELLY_GATE_ACCESS_PIN;
  const deviceId = process.env.SHELLY_GATE_DEVICE_ID || DEFAULT_DEVICE_ID;
  const channel = Number(process.env.SHELLY_GATE_CHANNEL || 0);
  const toggleAfter = Number(process.env.SHELLY_GATE_TOGGLE_AFTER || 1);

  if (!host || !authKey || !deviceId || !getSessionSecret()) {
    return json(res, 500, {
      ok: false,
      error: "Shelly Cloud ist noch nicht vollständig konfiguriert.",
    });
  }

  const session = verifySessionToken(req);
  if (!session) {
    return json(res, 401, { ok: false, error: "Bitte neu einloggen." });
  }

  const role = String(session.role || "mitarbeiter").toLowerCase();
  const needsGatePin = role !== "admin" && role !== "teamleiter";

  if (req.method === "GET") {
    try {
      const status = await getShellyGateStatus({ host, authKey, deviceId, channel });
      return json(res, 200, { ok: true, ...status });
    } catch (error) {
      console.error("[shelly-gate] status error:", error);
      return json(res, 502, {
        ok: false,
        error: error?.message || "Shelly Status konnte nicht geladen werden.",
      });
    }
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || "Ungültige Anfrage." });
  }

  if (needsGatePin && !timingSafeEqualText(body?.pin, gatePin)) {
    return json(res, 401, { ok: false, error: "Tor-PIN ist falsch." });
  }

  try {
    const shellyRes = await fetch(
      `${host}/v2/devices/api/set/switch?auth_key=${encodeURIComponent(authKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deviceId,
          channel,
          on: true,
          toggle_after: toggleAfter,
        }),
      }
    );

    const text = await shellyRes.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!shellyRes.ok) {
      return json(res, 502, {
        ok: false,
        error: "Shelly Cloud hat den Befehl abgelehnt.",
        details: data,
      });
    }

    const triggeredBy = session.name || session.code || "Unbekannt";
    let adminPush = null;
    try {
      adminPush = await notifyAdminsAboutGate({ triggeredBy });
    } catch (pushError) {
      console.warn("[shelly-gate] admin push failed:", pushError);
      adminPush = { attempted: true, sent: 0, error: pushError?.message || "Push fehlgeschlagen." };
    }

    return json(res, 200, { ok: true, triggeredBy, adminPush });
  } catch (error) {
    console.error("[shelly-gate] Cloud error:", error);
    return json(res, 502, {
      ok: false,
      error: "Shelly Cloud ist derzeit nicht erreichbar.",
    });
  }
}
