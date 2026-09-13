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
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
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
      if (raw.length > 10000) {
        reject(new Error("Anfrage ist zu groß."));
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

function getSupabaseConfig() {
  return {
    url: process.env.VITE_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    setCors(req, res);
    res.statusCode = 204;
    return res.end();
  }

  const session = verifySessionToken(req);
  if (!session?.id) return json(req, res, 401, { ok: false, error: "Bitte neu einloggen." });

  const employeeId = String(session.id);

  try {
    if (req.method === "GET") {
      const data = await supabaseFetch(
        `app_notifications?select=id,title,body,sender_name,target,created_at,read_at&recipient_employee_id=eq.${encodeURIComponent(employeeId)}&read_at=is.null&order=created_at.desc&limit=20`
      );
      return json(req, res, 200, { ok: true, notifications: Array.isArray(data) ? data : [] });
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      const ids = Array.isArray(body?.ids)
        ? body.ids
            .map((id) => String(id).trim())
            .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
            .slice(0, 50)
        : [];
      if (!ids.length) return json(req, res, 400, { ok: false, error: "Keine Nachricht ausgewählt." });

      await supabaseFetch(
        `app_notifications?id=in.(${ids.join(",")})&recipient_employee_id=eq.${encodeURIComponent(employeeId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ read_at: new Date().toISOString() }),
        }
      );

      return json(req, res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET, PATCH, OPTIONS");
    return json(req, res, 405, { ok: false, error: "Methode nicht erlaubt." });
  } catch (error) {
    console.error("[app-notifications] error:", error);
    return json(req, res, 502, {
      ok: false,
      error: error?.message || "App-Nachrichten konnten nicht geladen werden.",
    });
  }
}
