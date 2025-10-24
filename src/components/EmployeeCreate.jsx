import { useState } from 'react';
import supabase from '../lib/supabase';

const ROLES = [
  { value: 'mitarbeiter', label: 'Mitarbeiter' },
  { value: 'teamleiter', label: 'Teamleiter' },
  { value: 'admin', label: 'Admin' },
];

export default function EmployeeCreate({ onCreated }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('mitarbeiter');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null); // {type:'error'|'success', text:string}

  async function handleCreate(e) {
    e.preventDefault();
    setMsg(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setMsg({ type: 'error', text: 'Bitte einen Namen eingeben.' });
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setMsg({ type: 'error', text: 'PIN muss 4–6 Ziffern haben.' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('add_mitarbeiter', {
        p_name: trimmed,
        p_pin: pin,
        p_rolle: role,
      });

      if (error) throw error;

      setMsg({ type: 'success', text: 'Mitarbeiter angelegt.' });
      setName('');
      setPin('');
      setRole('mitarbeiter');
      onCreated?.(); // Liste neu laden
    } catch (err) {
      setMsg({
        type: 'error',
        text: err?.message || 'Anlegen fehlgeschlagen.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>Mitarbeiter anlegen</h2>

      {msg && (
        <p
          className="mt-1"
          style={{ color: msg.type === 'error' ? 'var(--danger)' : 'var(--brand-dark)' }}
        >
          {msg.text}
        </p>
      )}

      <form onSubmit={handleCreate} className="form-grid">
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Armin"
          />
        </label>

        <label>
          Rolle
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>

        <label>
          PIN (4–6 Ziffern)
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputMode="numeric"
            placeholder="1234"
          />
        </label>

        <div>
          <button type="submit" disabled={loading}>
            {loading ? 'Anlegen…' : 'Anlegen'}
          </button>
        </div>
      </form>
    </div>
  );
}
