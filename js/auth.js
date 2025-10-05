
function ensureSeedAdmin(){
  const users = readUsers();
  if(!users.length){
    users.push({id:'u1', name:'Administrator', username:'admin', role:'admin', password:'admin', mustChangePassword:true});
    users.push({id:'u2', name:'Teamleiter', username:'lead', role:'lead', password:'lead', mustChangePassword:true});
    users.push({id:'u3', name:'Mitarbeiter', username:'user', role:'employee', password:'user', mustChangePassword:true});
    writeUsers(users);
  }
}
async function login(username, password){
  ensureSeedAdmin();
  const uname = String(username||'').trim().toLowerCase();
  const pwd = String(password||'').trim();
  const users = readUsers();
  const u = users.find(x=> String(x.username||'').toLowerCase()===uname);
  if(!u) return {ok:false, error:'Unbekannter Nutzer'};
  if(String(u.password)!==pwd) return {ok:false, error:'Falsches Passwort'};
  writeSession({userId:u.id, ts:Date.now()});
  return {ok:true, mustChangePassword:!!u.mustChangePassword};
}
function changeOwnPassword(newPw){
  if(!newPw || newPw.length<4){ alert('Passwort zu kurz'); return false; }
  const me = currentUser(); if(!me) return false;
  const users = readUsers(); const i = users.findIndex(x=>x.id===me.id);
  if(i>=0){ users[i].password = newPw; users[i].mustChangePassword=false; writeUsers(users); return true; }
  return false;
}
