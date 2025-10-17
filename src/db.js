import Dexie from 'dexie'
export const db = new Dexie('zeiterfassung_roles_db')
db.version(1).stores({
  employees: '++id, name, role', // role: admin|lead|worker
  entries: '++id, employeeId, date, startMin, endMin, breakMin, note, project, synced',
})
db.on('populate', async () => {
  const adminId = await db.employees.add({ name: 'Admin', role: 'admin' })
  const leadId = await db.employees.add({ name: 'Teamleiter', role: 'lead' })
  const workerId = await db.employees.add({ name: 'Mitarbeiter', role: 'worker' })
})
export default db
