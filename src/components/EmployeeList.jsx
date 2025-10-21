import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function EmployeeList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    const { data, error } = await supabase
      .from('mitarbeiter')
      .select('id, name, rolle, aktiv, created_at')
      .order('name', { ascending: true });

    if (error) setMsg({ type: 'error', text: error.message });
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleResetPin(id) {
    const newPin = prompt('Neue PIN (4–6 Ziffern):');
    if (!newPin) return;
    if (!/^\d{4,6}$/.test(newPin)) return alert('Ungültige PIN.');

    const { error } = await supabase.rpc('reset_pin', { p_id: id, p_new_pin: newPin });
    if (error) return alert(error.message);
    alert('PIN aktualisiert.');
  }

  async function handleToggleActive(row) {
    const { error } = await supabase
      .from('mitarbeiter')
      .update({ aktiv: !row.aktiv })
      .eq('id', row.id);
    if (error) return alert(error.message);
    load();
  }

  async function handleDelete(row) {
    if (!confirm(`Mitarbeiter „${row.name}“ wirklich löschen?`)) return;
    const { error } = await supabase.from('mitarbeiter').delete().eq('id', row.id);
    if (error) return alert(error.message);
    load();
  }

  if (loading) return <div className="card">Lade Mitarbeiter…</div>;

  return (
    <div className="card">
      <h2>Mitarbeiter</h2>

      {msg && (
        <p className="mt-1" style={{ color: 'var(--danger)' }}>
          {msg.text}
        </p>
      )}

      <div className="table">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rolle</th>
              <th>Status</th>
              <th>Seit</th>
              <th style={{ width: 300 }}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5}>Keine Mitarbeiter vorhanden.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.rolle}</td>
                <td>
                  <span className="chip" style={{ background: r.aktiv ? '#eaf8f0' : '#f8eaea' }}>
                    {r.aktiv ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </td>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                <td>
                  <button className="button ghost" onClick={() => handleResetPin(r.id)}>
                    PIN zurücksetzen
                  </button>{' '}
                  <button className="button secondary" onClick={() => handleToggleActive(r)}>
                    {r.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                  </button>{' '}
                  <button className="button" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleDelete(r)}>
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
