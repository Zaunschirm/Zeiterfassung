
import React from 'react'
import db from '../db'
import { toLabel } from '../utils/time'
import { pushEntries } from '../utils/sync'

export default function EntryTable({ session, user }) {
  const [rows, setRows] = React.useState([])
  async function load() { const data = await db.entries.orderBy('date').reverse().limit(300).toArray(); setRows(data) }
  React.useEffect(() => { load() }, [])

  async function remove(id) { if (!confirm('Eintrag löschen?')) return; await db.entries.delete(id); load() }
  async function syncNow() {
    try {
      const uid = user?.id || null
      const n = await pushEntries(uid)
      alert(`Sync ok: ${n} Einträge`)
      load()
    } catch (e) { alert('Sync-Fehler: ' + e.message) }
  }

  return (<div className="card">
    <h2>Letzte Einträge</h2>
    <div className="row"><button className="button secondary" onClick={syncNow}>Jetzt synchronisieren</button></div>
    <table className="table">
      <thead><tr>
        <th>Datum</th><th>Mitarbeiter</th><th>Projekt</th><th>Start</th><th>Ende</th><th>Pause</th><th>Dauer</th><th>Synced</th><th></th>
      </tr></thead>
      <tbody>
        {rows.map(r => (<tr key={r.id}>
          <td>{r.date}</td><td>{r.employeeId}</td><td>{r.project}</td>
          <td>{toLabel(r.startMin)}</td><td>{toLabel(r.endMin)}</td>
          <td>{r.breakMin} min</td>
          <td>{Math.max(0, (r.endMin - r.startMin) - r.breakMin)} min</td>
          <td>{r.synced ? '✓' : '–'}</td>
          <td><button className="button secondary" onClick={()=>remove(r.id)}>löschen</button></td>
        </tr>))}
      </tbody>
    </table>
  </div>)
}
