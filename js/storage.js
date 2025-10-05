
// Cloud-aware storage wrapper (uses cloud.js if enabled, else falls back to local/session storage)

// Safe storage (localStorage fallback)
function bestStorage(){
  try{
    const k='__zz_test__'+Math.random();
    window.localStorage.setItem(k,'1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  }catch(e){
    try{
      const k='__zz_test__'+Math.random();
      window.sessionStorage.setItem(k,'1');
      window.sessionStorage.removeItem(k);
      console.warn('localStorage blockiert – nutze sessionStorage');
      return window.sessionStorage;
    }catch(e2){
      return null;
    }
  }
}
const __STORE = bestStorage();
const DB = { usersKey:'z_users', sessionKey:'z_session', timesKey:'z_times', planKey:'z_plan', projectsKey:'z_projects' };
function __read(key, fallback){ if(!__STORE) return fallback; try{ return JSON.parse(__STORE.getItem(key)||JSON.stringify(fallback)); }catch(e){ return fallback; } }
function __write(key, value){ if(!__STORE){ alert('Speicher (localStorage) nicht verfügbar – bitte normalen Tab ohne privaten Modus/Blocker verwenden.'); return; } try{ __STORE.setItem(key, JSON.stringify(value)); }catch(e){ alert('Speicher voll oder blockiert.'); } }

const readUsers = ()=> __read(DB.usersKey, []);
const writeUsers = (a)=> __write(DB.usersKey, a);
const readSession = ()=> __read(DB.sessionKey, null);
const writeSession = (s)=> __write(DB.sessionKey, s);
const readTimes = ()=> __read(DB.timesKey, {});
const writeTimes = (o)=> __write(DB.timesKey, o);
const readPlan = ()=> __read(DB.planKey, {});
const writePlan = (o)=> __write(DB.planKey, o);
const readProjects = ()=> __read(DB.projectsKey, []);
const writeProjects = (a)=> __write(DB.projectsKey, a);

// high-level helpers to get/set full state for cloud
function __getFullState(){ return { users: readUsers(), times: readTimes(), plan: readPlan(), projects: readProjects() }; }
function __applyFullState(state){
  if(!state) return;
  writeUsers(state.users||[]);
  writeTimes(state.times||{});
  writePlan(state.plan||{});
  writeProjects(state.projects||[]);
}
// If cloud enabled, subscribe and keep local in sync
(function(){
  try{
    if(window.CLOUD && window.CLOUD.enabled){
      cloudSubscribe((data)=>{ __applyFullState(data); console.log('Cloud -> Local aktualisiert'); });
      // Patch writers to also push to cloud
      const _wu=writeUsers, _wt=writeTimes, _wp=writePlan, _wpr=writeProjects;
      writeUsers = (a)=>{ _wu(a); if(window.CLOUD.enabled) cloudSaveFull(__getFullState()); };
      writeTimes = (o)=>{ _wt(o); if(window.CLOUD.enabled) cloudSaveFull(__getFullState()); };
      writePlan = (o)=>{ _wp(o); if(window.CLOUD.enabled) cloudSaveFull(__getFullState()); };
      writeProjects = (a)=>{ _wpr(a); if(window.CLOUD.enabled) cloudSaveFull(__getFullState()); };
    }
  }catch(e){ console.warn('Cloud storage init error', e); }
})();
