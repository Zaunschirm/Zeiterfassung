// src/LoginPanel.jsx
import React, { useState } from 'react'
import { supabase } from './lib/supabase'
import { setSession } from './lib/session'
import './styles.css'

export default function LoginPanel({ onLogin }) {
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    if (!code || !pin) {
      setError('Bitte Code und PIN eingeben.')
      return
    }
    setLoading(true)
    try {
      // >>> 4-stellige Klartext-PIN; login_lookup liefert genau 1 Zeile oder 0 Zeilen
      const { data, error: rpcError } = await supabase
        .rpc('login_lookup', { p_code: code, p_pin: pin })

      if (rpcError) throw rpcError
      if (!data || data.length === 0) {
        setError('PIN oder Code falsch.')
        return
      }

      // Erwartete Spalten: id, name, code, role, active
      const row = data[0]
      const session = {
        user: {
          id: row.id,
          name: row.name,
          code: row.code,
          role: row.role,      // 'admin' | 'teamleiter' | 'mitarbeiter'
          active: row.active === true,
        },
      }
      setSession(session)
      if (typeof onLogin === 'function') onLogin(session.user)
    } catch (err) {
      console.error('[Login]', err)
      setError('Anmeldung fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-panel">
      <form onSubmit={handleLogin}>
        <label>Code</label>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="z. B. ZS"
        />
        <label>PIN</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
        />
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn" disabled={loading}>
          {loading ? 'Login…' : 'Login'}
        </button>
      </form>
    </div>
  )
}
