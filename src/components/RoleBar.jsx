
import React from 'react'
import db from '../db'
import { pullEmployees } from '../utils/sync'

export default function RoleBar({ session, setSession }) {
  const [employees, setEmployees] = React.useState([])

  async function load() {
    const list = await pullEmployees().catch(async _ => await db.employees.toArray())
    setEmployees(list)
  }
  React.useEffect(() => { load() }, [])

  return (<div className="card">
    <h2>Rollen & Benutzer</h2>
    <div className="row">
      <select className="input" value={session.role} onChange={e=>setSession({...session, role:e.target.value})}>
        <option value="admin">Admin</option>
        <option value="lead">Teamleiter</option>
        <option value="worker">Mitarbeiter</option>
      </select>
      <select className="input" value={session.employeeId} onChange={e=>setSession({...session, employeeId:Number(e.target.value)})}>
        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>)}
      </select>
      <div className="small">Rolle steuert Sicht & Bearbeitung.</div>
    </div>
  </div>)
}
