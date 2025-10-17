
import React from 'react'
import { signIn, signOut, getUser } from '../utils/auth'

export default function LoginPanel({ onAuth }) {
  const [email, setEmail] = React.useState('')
  const [pass, setPass] = React.useState('')
  const [user, setUser] = React.useState(null)
  React.useEffect(() => { getUser().then(u => { setUser(u); onAuth && onAuth(u) }) }, [])
  async function handleLogin() {
    try {
      const u = await signIn(email, pass); setUser(u); onAuth && onAuth(u)
    } catch (e) { alert(e.message) }
  }
  async function handleLogout() {
    await signOut(); setUser(null); onAuth && onAuth(null)
  }
  if (!getUser) return null
  return (<div className="card">
    <h2>Login (Supabase)</h2>
    {user ? (<div className="row">
      <div className="badge">eingeloggt: {user.email}</div>
      <button className="button secondary" onClick={handleLogout}>Logout</button>
    </div>) : (<div className="row">
      <input className="input" placeholder="E-Mail" value={email} onChange={e=>setEmail(e.target.value)} />
      <input className="input" placeholder="Passwort" type="password" value={pass} onChange={e=>setPass(e.target.value)} />
      <button className="button" onClick={handleLogin}>Login</button>
    </div>)}
    <p className="small">Falls nicht konfiguriert, läuft die App offline ohne Login.</p>
  </div>)
}
