// src/NavBar.jsx
import React from 'react'
import { getSession, clearSession } from './lib/session'
import { Link, useLocation, useNavigate } from 'react-router-dom'

export default function NavBar() {
  const nav = useNavigate()
  const loc = useLocation()
  const session = getSession()
  const role = session?.user?.role || 'mitarbeiter'
  const name = session?.user?.name || ''

  const canManage = role === 'admin' || role === 'teamleiter'

  function logout() {
    clearSession()
    nav('/login')
  }

  const isActive = (path) => (loc.pathname.startsWith(path) ? 'active' : '')

  return (
    <header className="topbar">
      <div className="brand">Holzbau&nbsp;Zaunschirm</div>
      <nav>
        <Link className={isActive('/zeiterfassung')} to="/zeiterfassung">Zeiterfassung</Link>
        {canManage && (
          <>
            <Link className={isActive('/projektfotos')} to="/projektfotos">Projektfotos</Link>
            <Link className={isActive('/mitarbeiter')} to="/mitarbeiter">Mitarbeiter</Link>
          </>
        )}
        <Link className={isActive('/monatsuebersicht')} to="/monatsuebersicht">Monatsübersicht</Link>
      </nav>
      <div className="session">
        <span className="user">{name} ({role})</span>
        <button className="btn btn-small" onClick={logout}>Logout</button>
      </div>
    </header>
  )
}
