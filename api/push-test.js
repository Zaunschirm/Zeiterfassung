import crypto from "node:crypto";
import webpush from "web-push";

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
      if (raw.length > 4096) {
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

async function disableSubscription(endpoint) {
  if (!endpoint) return;
  await supabaseFetch(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      push_enabled: false,
      updated_at: new Date().toISOString(),
    }),
  });
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
  if (!session) {
    return json(req, res, 401, { ok: false, error: "Bitte neu einloggen." });
  }

  if (!configureWebPush()) {
    return json(req, res, 500, { ok: false, error: "Web-Push ist am Server noch nicht vollständig konfiguriert." });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    return json(req, res, 400, { ok: false, error: error.message || "Ungültige Anfrage." });
  }

  const endpoint = String(body?.endpoint || "").trim();
  if (!endpoint) {
    return json(req, res, 400, { ok: false, error: "Geräte-Endpunkt fehlt. Bitte Gerät zuerst aktivieren." });
  }

  try {
    const subscriptions = await supabaseFetch(
      `push_subscriptions?select=id,employee_id,employee_name,endpoint,p256dh,auth,push_enabled&endpoint=eq.${encodeURIComponent(endpoint)}&limit=1`
    );
    const subscription = Array.isArray(subscriptions) ? subscriptions[0] : null;

    if (!subscription || String(subscription.employee_id) !== String(session.id)) {
      return json(req, res, 404, { ok: false, error: "Dieses Gerät ist für deinen Benutzer noch nicht registriert." });
    }

    if (subscription.push_enabled === false) {
      return json(req, res, 409, { ok: false, error: "Push ist für dieses Gerät deaktiviert." });
    }

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify({
        title: "Zeiterfassung Test",
        body: "Echte Push-Benachrichtigung vom Server. Wenn du das siehst, funktioniert Hintergrund-Push.",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        url: "/zeiterfassung",
      })
    );

    return json(req, res, 200, { ok: true, sent: 1 });
  } catch (error) {
    const statusCode = Number(error?.statusCode || error?.status);
    if (statusCode === 404 || statusCode === 410) {
      await disableSubscription(endpoint).catch(() => {});
      return json(req, res, 410, {
        ok: false,
        error: "Dieses Gerät ist nicht mehr gültig registriert. Bitte Benachrichtigungen auf diesem Gerät neu aktivieren.",
      });
    }

    console.error("[push-test] send error:", error);
    return json(req, res, 502, {
      ok: false,
      error: error?.message || "Test-Push konnte nicht gesendet werden.",
    });
  }
}
