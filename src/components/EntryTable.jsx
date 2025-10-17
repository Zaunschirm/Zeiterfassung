import React from 'react'
import db from '../db'
import { toLabel } from '../utils/time'
import { getSession } from '../utils/auth'

export default function EntryTable() {
  const [rows, setRows] = React.useState([])
  const sess = getSession()
  const canEditAll = sess.role === 'admin' || sess.role === 'lead'

  async function load() {
    const data = await db.entries.orderBy('date').reverse().limit(200).toArray()
    setRows(data)
  }
  React.useEffect(() => { load() }, [])

  async function remove(id) {
    if (!confirm('Eintrag löschen?')) return
    await db.entries.delete(id); load()
  }

  return (<div className="card">
    <h2>Letzte Einträge</h2>
    <table className="table">
      <thead><tr>
        <th>Datum</th><th>Mitarbeiter</th><th>Projekt</th><th>Start</th><th>Ende</th><th>Pause</th><th>Dauer</th><th></th>
      </tr></thead>
      <tbody>
        {rows.map(r => (<tr key={r.id}>
          <td>{r.date}</td>
          <td>{r.employeeId}</td>
          <td>{r.project}</td>
          <td>{toLabel(r.startMin)}</td>
          <td>{toLabel(r.endMin)}</td>
          <td>{r.breakMin} min</td>
          <td>{Math.max(0, (r.endMin - r.startMin) - r.breakMin)} min</td>
          <td><button className="button secondary" onClick={()=>remove(r.id)}>löschen</button></td>
        </tr>))}
      </tbody>
    </table>
  </div>)
}
