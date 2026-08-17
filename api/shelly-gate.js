const DEFAULT_DEVICE_ID = "e4b3233fd228";

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function normalizeHost(host) {
  return String(host || "").trim().replace(/\/+$/, "");
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

  if (!host || !authKey || !gatePin || !deviceId) {
    return json(res, 500, {
      ok: false,
      error: "Shelly Cloud ist noch nicht vollständig konfiguriert.",
    });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || "Ungültige Anfrage." });
  }

  if (!timingSafeEqualText(body?.pin, gatePin)) {
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

    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("[shelly-gate] Cloud error:", error);
    return json(res, 502, {
      ok: false,
      error: "Shelly Cloud ist derzeit nicht erreichbar.",
    });
  }
}
