import React from 'react'
import db from '../db'
import { getSession, setSession } from '../utils/auth'

export default function RoleBar({ onChange }) {
  const [employees, setEmployees] = React.useState([])
  const [session, setSess] = React.useState(getSession())

  React.useEffect(() => { db.employees.toArray().then(setEmployees) }, [])

  function changeRole(role) {
    const s = { ...session, role }
    setSess(s); setSession(s); onChange && onChange(s)
  }
  function changeEmployee(eid) {
    const s = { ...session, employeeId: Number(eid) }
    setSess(s); setSession(s); onChange && onChange(s)
  }

  return (<div className="card">
    <h2>Rollen & Benutzer</h2>
    <div className="row">
      <select className="input" value={session.role} onChange={e=>changeRole(e.target.value)}>
        <option value="admin">Admin</option>
        <option value="lead">Teamleiter</option>
        <option value="worker">Mitarbeiter</option>
      </select>
      <select className="input" value={session.employeeId} onChange={e=>changeEmployee(e.target.value)}>
        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>)}
      </select>
      <div className="small">Aktuelle Rolle steuert Berechtigungen.</div>
    </div>
  </div>)
}
