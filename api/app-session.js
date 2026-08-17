import crypto from "node:crypto";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function normalizePin(value) {
  return String(value || "").trim();
}

function decodeStoredPin(value) {
  try {
    return Buffer.from(String(value || ""), "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function matchesStoredPin(storedValue, enteredValue) {
  const stored = normalizePin(storedValue);
  const entered = normalizePin(enteredValue);
  if (!stored || !entered) return false;
  if (stored === entered) return true;
  return normalizePin(decodeStoredPin(stored)) === entered;
}

function getSessionSecret() {
  return process.env.APP_SESSION_SECRET || process.env.SHELLY_CLOUD_AUTH_KEY || "";
}

function signPayload(payload) {
  const secret = getSessionSecret();
  if (!secret) throw new Error("APP_SESSION_SECRET fehlt.");

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

async function readBody(req) {
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
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Ungültige Anfrage."));
      }
    });
    req.on("error", reject);
  });
}

function normalizeRole(role) {
  const r = String(role || "mitarbeiter").trim().toLowerCase();
  if (r === "admin") return "admin";
  if (r === "teamleiter") return "teamleiter";
  return "mitarbeiter";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Nur POST erlaubt." });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey || !getSessionSecret()) {
    return json(res, 500, { ok: false, error: "Server-Login ist noch nicht konfiguriert." });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || "Ungültige Anfrage." });
  }

  const code = String(body?.code || "").trim();
  const pin = String(body?.pin || "").trim();

  if (!code || !/^\d{4}$/.test(pin)) {
    return json(res, 400, { ok: false, error: "Code oder PIN fehlt." });
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/employees?select=id,code,name,role,active,disabled,pin&code=eq.${encodeURIComponent(code)}&limit=1`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  );

  const rows = await response.json().catch(() => []);
  const employee = Array.isArray(rows) ? rows[0] : null;

  if (!response.ok || !employee) {
    return json(res, 401, { ok: false, error: "Login konnte nicht geprüft werden." });
  }

  const role = normalizeRole(employee.role);
  if (role !== "admin" && (employee.disabled === true || employee.active === false)) {
    return json(res, 403, { ok: false, error: "Mitarbeiter ist deaktiviert." });
  }

  if (!matchesStoredPin(employee.pin, pin)) {
    return json(res, 401, { ok: false, error: "PIN ist falsch." });
  }

  const now = Math.floor(Date.now() / 1000);
  const token = signPayload({
    id: String(employee.id),
    code: employee.code,
    name: employee.name || employee.code,
    role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  });

  return json(res, 200, { ok: true, token });
}
