import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function EmployeeCreate({ onCreated }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState('mitarbeiter');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !pin.trim()) {
      setMsg('Name und PIN dürfen nicht leer sein');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc('add_mitarbeiter', {
      p_name: name.trim(),
      p_pin: pin,
      p_rolle: role
    });
    setLoading(false);

    if (error) {
      console.error(error);
      setMsg('Fehler: ' + error.message);
    } else {
      setMsg(`Mitarbeiter „${name}“ angelegt`);
      setName('');
      setPin('');
      setRole('mitarbeiter');
      onCreated?.();
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      style={{
        background: '#1c1c1c',
        padding: '1rem',
        borderRadius: '10px',
        color: 'white',
        marginBottom: '1rem',
      }}
    >
      <h3 style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>
        Mitarbeiter anlegen
      </h3>

      {msg && <div style={{ marginBottom: '0.5rem', color: '#a8ffb5' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, padding: '0.5rem', borderRadius: '5px' }}
        />
        <input
          type="password"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          style={{ flex: 1, padding: '0.5rem', borderRadius: '5px' }}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{ flex: 1, padding: '0.5rem', borderRadius: '5px' }}
        >
          <option value="mitarbeiter">Mitarbeiter</option>
          <option value="teamleiter">Teamleiter</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          background: '#885A2B',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          padding: '0.5rem 1rem',
          cursor: 'pointer',
        }}
      >
        {loading ? 'Speichere...' : 'Anlegen'}
      </button>
    </form>
  );
}
