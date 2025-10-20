// src/components/LoginPanel.jsx
import React, { useEffect, useState } from 'react'
import { signIn, signOut, getUser } from '../utils/auth'

// Mitarbeiter-Admin (nur nach Login sichtbar)
import EmployeeCreate from './EmployeeCreate'
import EmployeeList from './EmployeeList'

/**
 * Optionales onAuth-Callback:
 * - Wird aufgerufen, wenn sich der Auth-Status ändert (Login/Logout).
 */
export default function LoginPanel({ onAuth }) {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Beim Mount aktuellen User laden
  useEffect(() => {
    let isMounted = true
    ;(async () => {
      try {
        const u = await getUser()
        if (isMounted) {
          setUser(u)
          setLoading(false)
          onAuth && onAuth(u)
        }
      } catch (e) {
        if (isMounted) {
          setError(e?.message || 'Konnte Auth-Status nicht ermitteln.')
          setLoading(false)
        }
      }
    })()
    return () => { isMounted = false }
  }, [onAuth])

  async function handleLogin() {
    setError('')
    setSubmitting(true)
    try {
      const u = await signIn(email.trim(), pass)
      setUser(u)
      setEmail('')
      setPass('')
      onAuth && onAuth(u)
    } catch (e) {
      setError(e?.message || 'Login fehlgeschlagen.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    setError('')
    setSubmitting(true)
    try {
      await signOut()
      setUser(null)
      onAuth && onAuth(null)
    } catch (e) {
      setError(e?.message || 'Logout fehlgeschlagen.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="card">
        <h2>Login (Supabase)</h2>
        <p>Prüfe Anmeldestatus …</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>Login (Supabase)</h2>

      {/* Status/Fehlermeldungen */}
      {error && (
        <div className="badge danger" style={{ marginBottom: '0.5rem' }}>
          {error}
        </div>
      )}

      {/* Wenn eingeloggt */}
      {user ? (
        <>
          <div className="row" style={{ alignItems: 'center', gap: '.5rem' }}>
            <div className="badge">eingeloggt: {user.email || '—'}</div>
            <button
              className="button secondary"
              onClick={handleLogout}
              disabled={submitting}
              title="Abmelden"
            >
              {submitting ? '…' : 'Logout'}
            </button>
          </div>

          <p className="small" style={{ marginTop: '.5rem' }}>
            Du bist angemeldet. Unten findest du die Mitarbeiter-Verwaltung.
          </p>

          <hr style={{ opacity: 0.15, margin: '1rem 0' }} />

          {/* Mitarbeiter-Administration */}
          <div style={{ display: 'grid', gap: '1rem' }}>
            <EmployeeCreate />
            <EmployeeList />
          </div>
        </>
      ) : (
        /* Wenn NICHT eingeloggt: Formular */
        <>
          <div className="row" style={{ gap: '.5rem', alignItems: 'center' }}>
            <input
              className="input"
              placeholder="E-Mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              autoComplete="username"
            />
            <input
              className="input"
              placeholder="Passwort"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="current-password"
            />
            <button
              className="button"
              onClick={handleLogin}
              disabled={submitting || !email || !pass}
              title="Anmelden"
            >
              {submitting ? '…' : 'Login'}
            </button>
          </div>

          <p className="small" style={{ marginTop: '.5rem' }}>
            Falls nicht konfiguriert, läuft die App offline ohne Login.
          </p>
        </>
      )}
    </div>
  )
}
