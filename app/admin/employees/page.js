'use client';
import { useEffect, useState } from 'react';

export default function AdminEmployees() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code:'', display_name:'', role:'employee', pin:'' });
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/employees');
    const data = await res.json();
    setList(data || []);
    setLoading(false);
  }
  useEffect(()=>{ load(); },[]);

  async function createEmployee(e) {
    e.preventDefault(); setMsg('');
    const res = await fetch('/api/admin/employees', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form)
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { setMsg(data.error || 'Fehler'); return; }
    setForm({ code:'', display_name:'', role:'employee', pin:'' });
    load();
  }

  async function toggleDisabled(id, disabled) {
    await fetch('/api/admin/employees/'+id, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ disabled })});
    load();
  }

  async function resetPin(id) {
    const pin = prompt('Neue PIN eingeben:');
    if (!pin) return;
    await fetch('/api/admin/employees/'+id, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ newPin: pin })});
    load();
  }

  async function del(id) {
    if (!confirm('Mitarbeiter wirklich löschen?')) return;
    await fetch('/api/admin/employees/'+id, { method:'DELETE' });
    load();
  }

  return (
    <main style={{padding:24}}>
      <h1>Admin · Mitarbeiter</h1>
      <a href="/dashboard">Zurück zum Dashboard</a>

      <section style={{marginTop:24, background:'#fff', padding:16, borderRadius:12}}>
        <h3>Neuen Mitarbeiter anlegen</h3>
        <form onSubmit={createEmployee} style={{display:'grid', gap:8, maxWidth:400}}>
          <input placeholder="Code (z. B. stefan)" value={form.code} onChange={e=>setForm({...form, code:e.target.value})}/>
          <input placeholder="Name (z. B. Stefan Zaunschirm)" value={form.display_name} onChange={e=>setForm({...form, display_name:e.target.value})}/>
          <select value={form.role} onChange={e=>setForm({...form, role:e.target.value})}>
            <option value="employee">employee</option>
            <option value="admin">admin</option>
          </select>
          <input placeholder="PIN (optional; kann später gesetzt werden)" value={form.pin} onChange={e=>setForm({...form, pin:e.target.value})}/>
          <button>Speichern</button>
          <div style={{color:'#b00020'}}>{msg}</div>
        </form>
      </section>

      <section style={{marginTop:24}}>
        <h3>Alle Mitarbeiter</h3>
        {loading ? <p>Lade…</p> : (
          <table style={{borderCollapse:'collapse', width:'100%', background:'#fff'}}>
            <thead><tr><th style={{textAlign:'left', padding:8}}>Code</th><th style={{textAlign:'left', padding:8}}>Name</th><th style={{textAlign:'left', padding:8}}>Rolle</th><th style={{padding:8}}>Aktiv</th><th style={{padding:8}}>Aktionen</th></tr></thead>
            <tbody>
              {list.map(e => (
                <tr key={e.id} style={{borderTop:'1px solid #eee'}}>
                  <td style={{padding:8}}>{e.code}</td>
                  <td style={{padding:8}}>{e.display_name}</td>
                  <td style={{padding:8}}>{e.role}</td>
                  <td style={{padding:8}}>
                    <input type="checkbox" checked={!e.disabled} onChange={ev=>toggleDisabled(e.id, !ev.target.checked)} />
                  </td>
                  <td style={{padding:8, display:'flex', gap:8}}>
                    <button onClick={()=>resetPin(e.id)}>PIN setzen</button>
                    <button onClick={()=>del(e.id)} style={{background:'#b00020', color:'#fff'}}>Löschen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
