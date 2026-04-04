// src/lib/session.js
const KEY = "hbz_session_v1";

export function setSession(payload, persistent = false) {
  clearSession();

  const storage = persistent ? localStorage : sessionStorage;
  storage.setItem(KEY, JSON.stringify(payload));
}

export function getSession() {
  try {
    const rawSession = sessionStorage.getItem(KEY);
    if (rawSession) return JSON.parse(rawSession);

    const rawLocal = localStorage.getItem(KEY);
    if (rawLocal) return JSON.parse(rawLocal);

    return null;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
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

  return true; // mitarbeiter
}