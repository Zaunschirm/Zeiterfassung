export function getSession() {
  const s = JSON.parse(localStorage.getItem('session') || 'null')
  if (s) return s
  const def = { userId: 1, role: 'admin', employeeId: 1 } // default: Admin
  localStorage.setItem('session', JSON.stringify(def))
  return def
}
export function setSession(s) { localStorage.setItem('session', JSON.stringify(s)) }
