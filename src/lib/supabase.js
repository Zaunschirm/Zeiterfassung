// /s// Anlegen
await supabase.rpc('add_mitarbeiter', {
  p_name: 'Armin',
  p_pin: '1234',
  p_rolle: 'mitarbeiter'
});

// Ändern
await supabase.rpc('update_mitarbeiter', {
  p_id: 'UUID-HIER',
  p_name: 'Armin Z.',
  p_status: 'aktiv'      // oder 'inaktiv'
  // p_new_pin: '4321'
});

// Löschen
await supabase.rpc('delete_mitarbeiter', { p_id: 'UUID-HIER' });

// PIN reset
await supabase.rpc('reset_pin', { p_id: 'UUID-HIER', p_new_pin: '0000' });

// Sync → Upsert (Array)
await supabase.rpc('sync_mitarbeiter', {
  p_payload: JSON.stringify([
    {
      id: 'UUID-ODER-NULL',
      name: 'Sabine',
      rolle: 'teamleiter',
      status: 'aktiv',
      updated_at: new Date().toISOString()
      // pin: '1234'  // optional
    }
  ])
});

// Änderungen seit Zeitstempel
const { data } = await supabase.rpc('get_mitarbeiter_changes_since', {
  p_since: new Date(Date.now() - 24*60*60*1000).toISOString() // letzte 24h
});

