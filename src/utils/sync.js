import db from '../db';
import supa from '../lib/supabase.js'; // <— Pfad und Name korrigiert

export async function pullEmployees() {
  if (!supa) return await db.employees.toArray(); // offline only
  const { data, error } = await supa.from('employees').select('id,name,role,auth_user');
  if (error) throw error;
  // cache locally
  await db.employees.clear();
  await db.employees.bulkAdd(data.map(e => ({ id: e.id, name: e.name, role: e.role, supa_user: e.auth_user })));
  return data;
}

export async function pushEntries(currentUserId) {
  const unsynced = await db.entries.where({ synced: 0 }).toArray();
  if (!supa || !unsynced.length === 0) return unsynced.length;

  const payload = unsynced.map(e => ({
    id: e.supa_id || undefined,
    owner: currentUserId,
    employee_id: e.employeeId,
    date: e.date,
    start_min: e.startMin,
    end_min: e.endMin,
    break_min: e.breakMin,
    note: e.note,
    project: e.project
  }));

  const { data, error } = await supa.from('time_entries').insert(payload).select('id');
  if (error) throw error;

  for (let i = 0; i < unsynced.length; i++) {
    await db.entries.update(unsynced[i].id, { synced: 1, supa_id: data[i]?.id });
  }
  return unsynced.length;
}
