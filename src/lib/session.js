// src/lib/session.js
const KEY = "hbz_session_v1";

export function setSession(payload) {
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function getSession() {
  const raw = localStorage.getItem(KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

export function currentUser() {
  const s = getSession();
  return s?.user ?? null;
}

export function hasRole(role) {
  const u = currentUser();
  if (!u) return false;
  const r = (u.role || "").toLowerCase();
  if (role === "admin") return r === "admin";
  if (role === "teamleiter") return r === "admin" || r === "teamleiter";
  return true; // "mitarbeiter"
}
