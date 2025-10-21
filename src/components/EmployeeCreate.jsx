import { useState } from 'react';
import { supabase } from '../lib/supabase';

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'teamleiter', label: 'Teamleiter' },
  { value: 'mitarbeiter', label: 'Mitarbeiter' },
];

export default function EmployeeCreate({ onCreated }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState('mitarbeiter');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    setMsg(null);

    // kleine Validierung
    if (!name.trim()) return setMsg({ type: 'error', text: 'Bitte Name eingeben.' });
    if (!/^\d{4,6}$/.test(pin)) {
      return setMsg({ type: 'error', text: 'PIN muss 4–6 Ziffern haben.' });
    }

    setLoading(true);
    try {
      // sichere Variante A (serverseitiges Hashing):
      const { data, error } = await supabase.rpc('add_mitarbeiter', {
        p_name: name.trim(),
        p_pin: pin,
        p_rolle: role,
      });

      if (error) throw error;

      setMsg({ type: 'ok', text: 'Mitarbeiter angelegt.' });
      setName('');
      setPin('');
      setRole('mitarbeiter');
      onCreated?.(); // Liste refreshen
    } catch (err) {
      console.error(err);
      setMsg({
        type: 'error',
        text:
          err?.message?.includes('function add_mitarbeiter')
            ? 'RPC-Funktion add_mitarbeiter fehlt. Bitte SQL unten ausführen.'
            : err.message || 'Fehler beim Anlegen.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>Mitarbeiter anlegen</h2>

      <form onSubmit={handleCreate} className="row">
        <div className="col">
          <label className="mb-1">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Armin"
            autoFocus
          />
        </div>

        <div className="col">
          <label className="mb-1">Rolle</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="col">
          <label className="mb-1">PIN (4–6 Ziffern)</label>
          <input
            className="input"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="1234"
            inputMode="numeric"
            maxLength={6}
          />
        </div>

        <div className="col" style={{ alignSelf: 'end' }}>
          <button className="button" disabled={loading}>
            {loading ? 'Speichern…' : 'Anlegen'}
          </button>
        </div>
      </form>

      {msg && (
        <p className="mt-2" style={{ color: msg.type === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
