
async function ensureSeedAdmin(){
  const users = await DBAPI.readUsers();
  if(!users.length){
    users.push({id:'u1', name:'Administrator', username:'admin', role:'admin', password:'admin', mustChangePassword:true});
    users.push({id:'u2', name:'Teamleiter', username:'lead', role:'lead', password:'lead', mustChangePassword:true});
    users.push({id:'u3', name:'Mitarbeiter', username:'user', role:'employee', password:'user', mustChangePassword:true});
    await DBAPI.writeUsers(users);
  }
}
async function login(username, password){
  await ensureSeedAdmin();
  const u = (await DBAPI.readUsers()).find(x=>x.username===username);
  if(!u) return {ok:false, error:'Unbekannter Nutzer'};
  if(u.password!==password) return {ok:false, error:'Falsches Passwort'};
  DBAPI.writeSession({userId:u.id, ts:Date.now()});
  return {ok:true, mustChangePassword:!!u.mustChangePassword};
}
function currentUser(){ const s = DBAPI.readSession(); if(!s) return null; const users = JSON.parse(localStorage.getItem(DB.usersKey)||'[]'); return users.find(x=>x.id===s.userId)||null; }
function logout(){ localStorage.removeItem(DB.sessionKey); location.replace('login.html'); }
function protectPage(roles=null){
  const me = currentUser();
  if(!me){ location.replace('login.html'); return; }
  if(Array.isArray(roles) && !roles.includes(me.role)){ alert('Kein Zugriff: '+me.role); location.replace('dashboard.html'); }
}
function changeOwnPassword(newPw){
  if(!newPw || newPw.length<4){ alert('Passwort zu kurz'); return false; }
  const me = currentUser(); if(!me) return false;
  (async ()=>{ const users = await DBAPI.readUsers(); const i = users.findIndex(x=>x.id===me.id); if(i>=0){ users[i].password = newPw; users[i].mustChangePassword=false; await DBAPI.writeUsers(users); }})();
  return true;
}
