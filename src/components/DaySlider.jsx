import React from 'react'
import db from '../db'
import { MIN_START, MAX_END, DEFAULT_START, DEFAULT_END, clamp15, toLabel, todayISO } from '../utils/time'
import { getSession } from '../utils/auth'

export default function DaySlider() {
  const [date, setDate] = React.useState(todayISO())
  const [start, setStart] = React.useState(DEFAULT_START)
  const [end, setEnd] = React.useState(DEFAULT_END)
  const [breakMin, setBreakMin] = React.useState(30)
  const [note, setNote] = React.useState('')
  const [project, setProject] = React.useState('Allgemein')
  const sess = getSession()
  const [employees, setEmployees] = React.useState([])
  const [employeeId, setEmployeeId] = React.useState(sess.employeeId)

  React.useEffect(() => { db.employees.toArray().then(setEmployees) }, [])

  const canEditAll = sess.role === 'admin' || sess.role === 'lead'

  function handleStart(val) {
    const v = Math.max(MIN_START, Math.min(val, end))
    setStart(clamp15(v))
  }
  function handleEnd(val) {
    const v = Math.min(MAX_END, Math.max(val, start))
    setEnd(clamp15(v))
  }
  async function save() {
    const empId = canEditAll ? Number(employeeId) : sess.employeeId
    const payload = {
      employeeId: empId,
      date,
      startMin: start,
      endMin: end,
      breakMin: clamp15(breakMin),
      note,
      project,
      synced: 0
    }
    await db.entries.add(payload)
    alert('Gespeichert.')
  }

  return (<div className="card">
    <h2>Tag erfassen (Slider, 15‑Min Raster)</h2>
    <div className="row">
      <input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)} />
      {canEditAll ? (
        <select className="input" value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>
          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
      ) : (
        <div className="badge">Nur eigener Tag</div>
      )}
      <input className="input" value={project} onChange={e=>setProject(e.target.value)} placeholder="Projekt" />
    </div>

    <div className="row" style={{width:'100%'}}>
      <div style={{flex:1}}>
        <div className="small">Start: <b>{toLabel(start)}</b> (min {toLabel(MIN_START)})</div>
        <input type="range" min={MIN_START} max={MAX_END} step="15" value={start} onChange={e=>handleStart(Number(e.target.value))} />
      </div>
      <div style={{flex:1}}>
        <div className="small">Ende: <b>{toLabel(end)}</b> (max {toLabel(MAX_END)})</div>
        <input type="range" min={MIN_START} max={MAX_END} step="15" value={end} onChange={e=>handleEnd(Number(e.target.value))} />
      </div>
    </div>

    <div className="row">
      <label className="small">Pause (min)</label>
      <input className="input" type="number" min="0" step="15" value={breakMin} onChange={e=>setBreakMin(Number(e.target.value))} />
      <input className="input" placeholder="Notiz" value={note} onChange={e=>setNote(e.target.value)} />
    </div>

    <div className="row">
      <div className="badge">Arbeitszeit: <b>{Math.max(0, (end - start) - breakMin)} Min</b></div>
      <button className="button" onClick={save}>Speichern</button>
    </div>
  </div>)
}
