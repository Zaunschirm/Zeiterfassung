import { useEffect, useState } from 'react';
import supa from '../lib/supabase.js';

export default function EmployeeList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('mitarbeiter')
      .select('id, name, rolle, aktiv')
      .order('name', { ascending: true });
    setLoading(false);
    if (error) console.error(error);
    setRows(data || []);
  };

  useEffect(() => { load(); }, []);

  return (
    <div
      style={{
        background: '#1c1c1c',
        padding: '1rem',
        borderRadius: '10px',
        color: 'white',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h3 style={{ fontWeight: 'bold' }}>Mitarbeiterliste</h3>
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: '#885A2B',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            padding: '0.3rem 0.8rem',
            cursor: 'pointer',
          }}
        >
          Neu laden
        </button>
      </div>

      <table
        style={{
          width: '100%',
          marginTop: '0.8rem',
          borderCollapse: 'collapse',
          fontSize: '0.9rem',
        }}
      >
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #444' }}>
            <th>Name</th>
            <th>Rolle</th>
            <th>Aktiv</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #333' }}>
              <td>{r.name}</td>
              <td>{r.rolle}</td>
              <td>{r.aktiv ? 'Ja' : 'Nein'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
