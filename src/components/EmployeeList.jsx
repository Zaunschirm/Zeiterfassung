import { useEffect, useState } from 'react';
import { supabase } from '../db';

export default function EmployeeList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null); // {type, text}
  const [hasAktiv, setHasAktiv] = useState(true); // wird auto-erkannt

  async function load() {
  async function load() {
  setLoading(true);
  setMsg(null);
  try {
    const { data, error } = await supabase
      .from('mitarbeiter')
      .select('id, name, rolle, status, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    setRows(data || []);
  } catch (err) {
    setMsg({ type: 'error', text: err?.message || 'Laden fehlgeschlagen.' });
    setRows([]);
  } finally {
    setLoading(false);
  }
}


  useEffect(() => {
    load();
  }, []);

  async function handleResetPin(id) {
    const pin = prompt('Neue PIN (4–6 Ziffern):');
    if (pin == null) return;
    if (!/^\d{4,6}$/.test(pin)) return alert('Ungültige PIN.');

    try {
      const { error } = await supabase.rpc('reset_pin', {
        p_id: id,
        p_new_pin: pin,
      });
      if (error) throw error;
      alert('PIN aktualisiert.');
    } catch (err) {
      alert(err?.message || 'Konnte PIN nicht ändern.');
    }
  }

 async function handleToggleAktiv(id, currentStatus) {
  try {
    const next = currentStatus === 'aktiv' ? 'inaktiv' : 'aktiv';
    const { error } = await supabase.rpc('update_mitarbeiter', {
      p_id: id,
      p_status: next,
    });
    if (error) throw error;
    await load();
  } catch (err) {
    setMsg({
      type: 'error',
      text: 'Aktiv-Status konnte nicht geändert werden. ' + (err?.message || ''),
    });
  }
}


  async function handleDelete(id, name) {
    if (!confirm(`Mitarbeiter „${name}“ wirklich löschen?`)) return;
    try {
      const { error } = await supabase.from('mitarbeiter').delete().eq('id', id);
      if (error) throw error;
      await load();
    } catch (err) {
      alert(err?.message || 'Löschen fehlgeschlagen.');
    }
  }

  if (loading) return <div className="card">Lade Mitarbeiter…</div>;

  return (
    <div className="card">
      <h2>Mitarbeiter</h2>

      {msg && (
        <p
          className="mt-1"
          style={{ color: msg.type === 'error' ? 'var(--danger)' : 'var(--brand-dark)' }}
        >
          {msg.text}
        </p>
      )}

      {!rows.length ? (
        <div>Keine Mitarbeiter vorhanden.</div>
      ) : (
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Rolle</th>
                {hasAktiv && <th>Status</th>}
                <th>Seit</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.rolle}</td>
                  {hasAktiv && (
                    <td>{r.aktiv ? 'Aktiv' : 'Inaktiv'}</td>
                  )}
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="btn-row">
                      <button onClick={() => handleResetPin(r.id)}>PIN zurücksetzen</button>
                      {hasAktiv && (
                       <button onClick={() => handleToggleAktiv(r.id)}>
  Aktiv wechseln
</button>

                        </button>
                      )}
                      <button onClick={() => handleDelete(r.id, r.name)}>Löschen</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
