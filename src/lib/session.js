// extrem einfache Sessionverwaltung für Variante C (Code + PIN)
const ME_KEY = 'hbz.me';       // speichert {id, code, name, role}
const CODE_KEY = 'meCode';     // falls du das bisher schon benutzt hast

export function getMe() {
  try { return JSON.parse(localStorage.getItem(ME_KEY)) || null; }
  catch { return null; }
}

export function setMe(me) {
  localStorage.setItem(ME_KEY, JSON.stringify(me || null));
  if (me?.code) localStorage.setItem(CODE_KEY, me.code);
}

export function clearMe() {
  localStorage.removeItem(ME_KEY);
  localStorage.removeItem(CODE_KEY);
}
