'use client'

import { useState } from 'react'

export default function LoginPage(){
  const [code,setCode]=useState('stefan')
  const [pin,setPin]=useState('')
  const [err,setErr]=useState<string|null>(null)
  const [loading,setLoading]=useState(false)

  async function onSubmit(e:any){
    e.preventDefault()
    setErr(null); setLoading(true)
    try{
      const res = await fetch('/api/login', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ code, pin })
      })
      const data = await res.json()
      if(!res.ok || !data.ok) throw new Error(data?.error || 'LOGIN_FAILED')
      // client side redirect
      window.location.href = '/admin'
    }catch(e:any){
      setErr(e.message || String(e))
    }finally{
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{maxWidth:540, margin:'10vh auto'}}>
      <h1 className="h1">Holzbau Zaunschirm</h1>
      <form onSubmit={onSubmit} className="row">
        <div>
          <div className="label">Mitarbeitercode</div>
          <input className="input" value={code} onChange={e=>setCode(e.target.value)} placeholder="z.B. stefan" />
        </div>
        <div>
          <div className="label">PIN</div>
          <input className="input" type="password" value={pin} onChange={e=>setPin(e.target.value)} />
        </div>
        <button className="btn" disabled={loading}>{loading?'Einloggen…':'Einloggen'}</button>
        {err && <div style={{color:'#b91c1c'}}>Fehler: {err}</div>}
      </form>
      <div style={{marginTop:12}} className="muted">
        Tipp: PIN-Hash mit <code>npm run pin:hash</code> erzeugen und in Supabase speichern.
      </div>
    </div>
  )
}
