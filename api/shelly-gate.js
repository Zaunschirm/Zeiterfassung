const DEFAULT_DEVICE_ID = "e4b3233fd228";
import crypto from "node:crypto";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Nur POST erlaubt." });
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

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || "Ungültige Anfrage." });
  }

  const role = String(session.role || "mitarbeiter").toLowerCase();
  const needsGatePin = role !== "admin" && role !== "teamleiter";

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

    return json(res, 200, { ok: true, triggeredBy: session.name || session.code || "Unbekannt" });
  } catch (error) {
    console.error("[shelly-gate] Cloud error:", error);
    return json(res, 502, {
      ok: false,
      error: "Shelly Cloud ist derzeit nicht erreichbar.",
    });
  }
}
