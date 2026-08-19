import crypto from "node:crypto";

const ALLOWED_ORIGINS = new Set([
  "https://zeiterfassung-rho.vercel.app",
  "http://127.0.0.1:5180",
  "http://localhost:5180",
]);

function setCors(req, res) {
  const origin = String(req.headers.origin || "");
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

function json(req, res, statusCode, payload) {
  res.statusCode = statusCode;
  setCors(req, res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
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
      if (raw.length > 12000) {
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

async function supabaseFetch(path, options = {}) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase Server-Schlüssel fehlt.");

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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    setCors(req, res);
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return json(req, res, 405, { ok: false, error: "Nur POST erlaubt." });
  }

  const session = verifySessionToken(req);
  if (!session) return json(req, res, 401, { ok: false, error: "Bitte neu einloggen." });

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    return json(req, res, 400, { ok: false, error: error.message || "Ungültige Anfrage." });
  }

  const endpoint = String(body?.endpoint || "").trim();
  const p256dh = String(body?.p256dh || "").trim();
  const auth = String(body?.auth || "").trim();

  if (!endpoint || !p256dh || !auth) {
    return json(req, res, 400, { ok: false, error: "Push-Gerätedaten fehlen." });
  }

  try {
    const now = new Date().toISOString();
    await supabaseFetch("push_subscriptions?on_conflict=endpoint", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        employee_id: String(session.id),
        employee_name: session.name || session.code || null,
        endpoint,
        p256dh,
        auth,
        push_enabled: true,
        device_name: body?.device_name || null,
        platform: body?.platform || null,
        updated_at: now,
      }),
    });

    return json(req, res, 200, { ok: true });
  } catch (error) {
    console.error("[push-register] error:", error);
    return json(req, res, 502, {
      ok: false,
      error: error?.message || "Push-Gerät konnte nicht gespeichert werden.",
    });
  }
}
