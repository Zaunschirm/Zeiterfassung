
'use client'; import {useState} from 'react';
export default function Login(){ const [code,setCode]=useState(''); const [pin,setPin]=useState(''); const [msg,setMsg]=useState(''); const [loading,setLoading]=useState(false);
async function submit(e){ e.preventDefault(); setMsg(''); setLoading(true);
  try{ const res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,pin})});
    const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error||'Login fehlgeschlagen'); location.href='/dashboard'; }
  catch(err){ setMsg(err.message);} finally{ setLoading(false);} }
return(<div style={{minHeight:'100svh',display:'grid',placeItems:'center'}}>
<form onSubmit={submit} style={{background:'#fff',padding:24,borderRadius:12,width:360,boxShadow:'0 10px 30px rgba(0,0,0,.08)'}}>
<h2>Holzbau Zaunschirm</h2>
<input placeholder='Mitarbeitercode' value={code} onChange={e=>setCode(e.target.value)} style={{width:'100%',padding:12,marginTop:8}}/>
<input placeholder='PIN' type='password' value={pin} onChange={e=>setPin(e.target.value)} style={{width:'100%',padding:12,marginTop:8}}/>
<button disabled={loading} style={{marginTop:12,width:'100%',padding:12,background:'#b68a2c',border:0,color:'#fff',borderRadius:8}}>{loading?'Bitte warten…':'Einloggen'}</button>
<div style={{color:'#b00020',minHeight:22,marginTop:6,fontSize:13}}>{msg}</div>
</form></div>); }
