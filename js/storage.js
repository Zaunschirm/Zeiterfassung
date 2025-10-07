
const DB = { usersKey:'z_users', sessionKey:'z_session', timesKey:'z_times', planKey:'z_plan', projectsKey:'z_projects' };
const readSession = ()=> JSON.parse(localStorage.getItem(DB.sessionKey)||'null');
const writeSession = (s)=> localStorage.setItem(DB.sessionKey, JSON.stringify(s));
function fsReady(){ return !!(window.FB && window.FB.db && window.FS); }
// USERS
async function readUsers(){ if(fsReady()) return await FS.readUsersFS(); return JSON.parse(localStorage.getItem(DB.usersKey)||'[]'); }
async function writeUsers(arr){ if(fsReady()){ await Promise.all(arr.map(u=>FS.writeUserFS(u))); } else { localStorage.setItem(DB.usersKey, JSON.stringify(arr)); } window.dispatchEvent(new CustomEvent('data-sync',{detail:{evt:'users'}})); }
async function addOrUpdateUser(u){ const arr = await readUsers(); const i=arr.findIndex(x=>x.id===u.id); if(i>=0) arr[i]=u; else arr.push(u); await writeUsers(arr); }
async function deleteUser(userId){
  if(fsReady()){ await FS.deleteUserFS(userId); }
  else{
    const arr = await readUsers(); localStorage.setItem(DB.usersKey, JSON.stringify(arr.filter(u=>u.id!==userId)));
    const times = JSON.parse(localStorage.getItem(DB.timesKey)||'{}'); if(times[userId]){ delete times[userId]; localStorage.setItem(DB.timesKey, JSON.stringify(times)); }
    const plan = JSON.parse(localStorage.getItem(DB.planKey)||'{}'); let changed=false;
    Object.keys(plan).forEach(w=>{ const days=plan[w]||{}; Object.keys(days).forEach(dk=>{ const obj=days[dk]||{}; Object.keys(obj).forEach(pid=>{ const list=(obj[pid]||[]); const filtered=list.filter(x=>x.uid!==userId); if(filtered.length!==list.length){ obj[pid]=filtered; changed=true; } }); }); });
    if(changed) localStorage.setItem(DB.planKey, JSON.stringify(plan));
  }
  window.dispatchEvent(new CustomEvent('data-sync',{detail:{evt:'users'}}));
}
// PROJECTS
async function readProjects(){ if(fsReady()) return await FS.readProjectsFS(); return JSON.parse(localStorage.getItem(DB.projectsKey)||'[]'); }
async function writeProjects(arr){ if(fsReady()) await Promise.all(arr.map(p=>FS.writeProjectFS(p))); else localStorage.setItem(DB.projectsKey, JSON.stringify(arr)); window.dispatchEvent(new CustomEvent('data-sync',{detail:{evt:'projects'}})); }
async function addProject(p){ await writeProjects([...(await readProjects()), p]); }
async function deleteProject(pid){ if(fsReady()) await FS.deleteProjectFS(pid); else{ const ps=await readProjects(); localStorage.setItem(DB.projectsKey, JSON.stringify(ps.filter(x=>x.id!==pid))); } window.dispatchEvent(new CustomEvent('data-sync',{detail:{evt:'projects'}})); }
// PLAN
async function readPlanWeek(weekId){ if(fsReady()) return await FS.readPlanFS(weekId); const all=JSON.parse(localStorage.getItem(DB.planKey)||'{}'); return all[weekId]||{}; }
async function writePlanWeek(weekId, days){ if(fsReady()) await FS.writePlanFS(weekId, days); else{ const all=JSON.parse(localStorage.getItem(DB.planKey)||'{}'); all[weekId]=days; localStorage.setItem(DB.planKey, JSON.stringify(all)); } window.dispatchEvent(new CustomEvent('data-sync',{detail:{evt:'plan'}})); }
// TIMES
async function readTimesByUser(userId){ if(fsReady()) return await FS.readTimesFS(userId, null); const all=JSON.parse(localStorage.getItem(DB.timesKey)||'{}'); return all[userId]||{}; }
async function readTimesByUserDay(userId, dayKey){ if(fsReady()) return await FS.readTimesFS(userId, dayKey); const all=JSON.parse(localStorage.getItem(DB.timesKey)||'{}'); return (all[userId]||{})[dayKey]||[]; }
async function writeTimesByUserDay(userId, dayKey, entries){ if(fsReady()) await FS.writeTimesFS(userId, dayKey, entries); else{ const all=JSON.parse(localStorage.getItem(DB.timesKey)||'{}'); if(!all[userId]) all[userId]={}; all[userId][dayKey]=entries; localStorage.setItem(DB.timesKey, JSON.stringify(all)); } window.dispatchEvent(new CustomEvent('data-sync',{detail:{evt:'times'}})); }
window.DBAPI = { readSession, writeSession, readUsers, writeUsers, addOrUpdateUser, deleteUser, readProjects, writeProjects, addProject, deleteProject, readPlanWeek, writePlanWeek, readTimesByUser, readTimesByUserDay, writeTimesByUserDay };
