'use client';
import { useState } from 'react';
export default function LoginPage(){
  const [code,setCode]=useState(''); const [pin,setPin]=useState(''); const [msg,setMsg]=useState(''); const [loading,setLoading]=useState(false);
  async function onSubmit(e){ e.preventDefault(); setMsg(''); setLoading(true); try{ const res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,pin})}); if(!res.ok){ const t=await res.json().catch(()=>({error:'Login fehlgeschlagen'})); throw new Error(t.error||res.statusText);} location.href='/dashboard'; }catch(err){ setMsg(err.message);} finally{ setLoading(false);} }
  return (<div style={{display:'grid',placeItems:'center',minHeight:'100svh'}}>
    <form onSubmit={onSubmit} style={{background:'#fff',padding:24,borderRadius:16,boxShadow:'0 10px 30px rgba(0,0,0,.08)',width:360}}>
      <h2 style={{marginTop:0}}>Holzbau Zaunschirm</h2>
      <label>Mitarbeitercode</label>
      <input value={code} onChange={e=>setCode(e.target.value)} placeholder='z.B. stefan' style={{width:'100%',padding:'12px 14px',border:'1px solid #ddd',borderRadius:10}} />
      <label style={{marginTop:12}}>PIN</label>
      <input value={pin} onChange={e=>setPin(e.target.value)} placeholder='PIN' type='password' inputMode='numeric' style={{width:'100%',padding:'12px 14px',border:'1px solid #ddd',borderRadius:10}} />
      <button disabled={loading} style={{marginTop:16,width:'100%',padding:'12px 14px',border:0,borderRadius:12,background:'#b68a2c',color:'#fff',fontWeight:700}}>{loading?'Bitte warten…':'Einloggen'}</button>
      <div style={{minHeight:22,color:'#b00020',fontSize:13,marginTop:8}}>{msg}</div>
    </form></div>);
}
