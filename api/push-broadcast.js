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
      if (raw.length > 10000) {
        reject(new Error("Nachricht ist zu groß."));
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

function normalizeTarget(target) {
  const value = String(target || "all").trim().toLowerCase();
  if (value === "teamleiter" || value === "admins") return value;
  return "all";
}

function targetLabel(target) {
  if (target === "teamleiter") return "Teamleiter";
  if (target === "admins") return "Admins";
  return "alle aktiven Mitarbeiter";
}

function employeeMatchesTarget(employee, target, senderId, includeSender) {
  const role = String(employee?.role || "").trim().toLowerCase();
  const isSender = String(employee?.id) === String(senderId);
  const isActive = employee?.disabled !== true && employee?.active !== false;

  if (includeSender && isSender) return true;
  if (target === "admins") return role === "admin";
  if (target === "teamleiter") return role === "teamleiter" && isActive;
  return isActive;
}

async function saveAppNotifications({ recipientIds, senderId, senderName, title, body, target }) {
  const rows = [...recipientIds].map((employeeId) => ({
    recipient_employee_id: String(employeeId),
    sender_employee_id: senderId ? String(senderId) : null,
    sender_name: senderName || null,
    title,
    body,
    target,
  }));

  if (!rows.length) return 0;

  await supabaseFetch("app_notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });

  return rows.length;
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

  const role = String(session.role || "").trim().toLowerCase();
  if (role !== "admin") {
    return json(req, res, 403, { ok: false, error: "Nur Admin darf Push-Nachrichten senden." });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    return json(req, res, 400, { ok: false, error: error.message || "Ungültige Anfrage." });
  }

  const message = String(body?.message || "").trim();
  const target = normalizeTarget(body?.target);
  const includeSender = body?.includeSender !== false;

  if (message.length < 2) {
    return json(req, res, 400, { ok: false, error: "Bitte eine Nachricht eingeben." });
  }

  if (message.length > 500) {
    return json(req, res, 400, { ok: false, error: "Nachricht ist zu lang. Maximal 500 Zeichen." });
  }

  try {
    const [employees, subscriptions] = await Promise.all([
      supabaseFetch("employees?select=id,name,role,active,disabled"),
      supabaseFetch("push_subscriptions?select=id,employee_id,employee_name,endpoint,p256dh,auth,push_enabled,device_name,platform"),
    ]);

    const recipientIds = new Set(
      (employees || [])
        .filter((employee) => employeeMatchesTarget(employee, target, session.id, includeSender))
        .map((employee) => String(employee.id))
    );

    if (!recipientIds.size) {
      return json(req, res, 404, {
        ok: false,
        error: `Keine Empfänger für ${targetLabel(target)} gefunden.`,
      });
    }

    const senderName = session.name || session.code || "Admin";
    const title = `Nachricht von ${senderName}`;
    const stored = await saveAppNotifications({
      recipientIds,
      senderId: session.id,
      senderName,
      title,
      body: message,
      target,
    });

    const recipientSubscriptions = (subscriptions || []).filter(
      (subscription) =>
        subscription?.push_enabled !== false &&
        recipientIds.has(String(subscription?.employee_id)) &&
        subscription?.endpoint &&
        subscription?.p256dh &&
        subscription?.auth
    );

    const webPushConfigured = configureWebPush();

    const payload = JSON.stringify({
      title,
      body: message,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      url: "/dashboard",
    });

    let sent = 0;
    let failed = 0;
    let disabledExpired = 0;

    if (webPushConfigured && recipientSubscriptions.length) {
      await Promise.allSettled(
        recipientSubscriptions.map(async (subscription) => {
          try {
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
          } catch (error) {
            failed += 1;
            const statusCode = Number(error?.statusCode || error?.status);
            if (statusCode === 404 || statusCode === 410) {
              disabledExpired += 1;
              await disableSubscription(subscription.endpoint).catch(() => {});
            }
          }
        })
      );
    }

    return json(req, res, 200, {
      ok: true,
      target,
      targetLabel: targetLabel(target),
      stored,
      sent,
      failed,
      disabledExpired,
      devices: recipientSubscriptions.length,
      recipients: recipientIds.size,
      pushConfigured: webPushConfigured,
    });
  } catch (error) {
    console.error("[push-broadcast] error:", error);
    return json(req, res, 502, {
      ok: false,
      error: error?.message || "Push-Nachricht konnte nicht gesendet werden.",
    });
  }
}
