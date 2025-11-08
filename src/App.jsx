// src/App.jsx
import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './NavBar'
import LoginPanel from './LoginPanel'
import DaySlider from './DaySlider'
import MonthlyOverview from './MonthlyOverview'
// (Optional: weitere Seiten)
import { getSession } from './lib/session'

function RequireAuth({ children, roles }) {
  const session = getSession()
  const user = session?.user
  if (!user) return <Navigate to="/login" replace />
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/zeiterfassung" replace />
  }
  return children
}

export default function App() {
  const session = getSession()
  const isLoggedIn = Boolean(session?.user)

  return (
    <div className="app">
      {isLoggedIn && <NavBar />}

      <Routes>
        <Route path="/login" element={<LoginPanel onLogin={() => window.location.hash = '#/zeiterfassung'} />} />

        <Route
          path="/zeiterfassung"
          element={
            <RequireAuth>
              <DaySlider />
            </RequireAuth>
          }
        />

        <Route
          path="/monatsuebersicht"
          element={
            <RequireAuth roles={['admin', 'teamleiter', 'mitarbeiter']}>
              <MonthlyOverview />
            </RequireAuth>
          }
        />

        {/* Admin/Teamleiter-Bereiche */}
        <Route
          path="/projektfotos"
          element={
            <RequireAuth roles={['admin', 'teamleiter']}>
              <div style={{padding:'1rem'}}>Projektfotos (bestehende Funktionen bleiben)</div>
            </RequireAuth>
          }
        />
        <Route
          path="/mitarbeiter"
          element={
            <RequireAuth roles={['admin', 'teamleiter']}>
              <div style={{padding:'1rem'}}>Mitarbeiter (bestehende Funktionen bleiben)</div>
            </RequireAuth>
          }
        />

        {/* Standard-Redirect */}
        <Route path="*" element={<Navigate to={isLoggedIn ? '/zeiterfassung' : '/login'} replace />} />
      </Routes>
    </div>
  )
}
