import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase'; // Pfad ggf. anpassen

export default function EmployeeList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    const { data, error } = await supabase
      .from('mitarbeiter')                       // <-- richtiger Tabellenname
      .select('id, name, role, created_at')      // nur vorhandene Spalten
      .order('created_at', { ascending: false });

    if (error) {
      setMsg({ type: 'error', text: error.message });
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="card">Lade Mitarbeiter…</div>;

  return (
    <div className="card">
      <h2>Mitarbeiter</h2>
      {msg && <p className="mt-1" style={{ color: 'var(--danger)' }}>{msg.text}</p>}
      {!rows.length ? (
        <div>Keine Mitarbeiter vorhanden.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rolle</th>
              <th>Seit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.role}</td>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
