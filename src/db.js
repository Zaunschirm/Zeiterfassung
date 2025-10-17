
import Dexie from 'dexie'
export const db = new Dexie('zeiterfassung_sync_db')
db.version(1).stores({
  employees: '++id, name, role, supa_user',
  entries: '++id, employeeId, date, startMin, endMin, breakMin, note, project, synced, supa_id',
})
db.on('populate', async () => {
  await db.employees.bulkAdd([
    { name: 'Admin', role: 'admin' },
    { name: 'Teamleiter', role: 'lead' },
    { name: 'Mitarbeiter', role: 'worker' }
  ])
})
export default db
