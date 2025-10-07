'use client'

import { useEffect, useState } from 'react'

export default function AdminPage(){
  const [rows,setRows]=useState<any[]>([])
  const [loading,setLoading]=useState(true)
  const [err,setErr]=useState<string|null>(null)

  async function load(){
    setErr(null); setLoading(true)
    try{
      const res = await fetch('/api/admin/employees', { cache:'no-store' })
      const data = await res.json()
      if(!data.ok) throw new Error(data?.error || 'LOAD_FAILED')
      setRows(data.employees||[])
    }catch(e:any){
      setErr(e.message || String(e))
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{ load() }, [])

  async function logout(){
    await fetch('/api/logout', {method:'POST'})
    window.location.href='/login'
  }

  return (
    <div className="card">
      <div className="flex">
        <h1 className="h1">Mitarbeiter</h1>
        <button className="btn" onClick={logout}>Abmelden</button>
      </div>

      {loading && <div className="muted">Lade…</div>}
      {err && <div style={{color:'#b91c1c'}}>Fehler: {err}</div>}

      {!loading && !err && (
        <table className="table">
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Rolle</th><th>Aktiv</th><th>Erstellt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r:any)=>(
              <tr key={r.id}>
                <td>{r.code}</td>
                <td>{r.display_name}</td>
                <td>{r.role}</td>
                <td>{r.disabled?'Nein':'Ja'}</td>
                <td className="muted">{r.created_at?.slice(0,19).replace('T',' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
