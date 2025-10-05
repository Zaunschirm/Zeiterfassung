
(function(){
  let editingId = null;
  const E = ()=> ({
    add: document.getElementById('addEmp'),
    save: document.getElementById('saveEmp'),
    search: document.getElementById('search'),
    name: document.getElementById('empName'),
    user: document.getElementById('empUser'),
    role: document.getElementById('empRole'),
    pw: document.getElementById('empPw'),
    photo: document.getElementById('empPhoto'),
    tbody: document.querySelector('#empTable tbody')
  });
  function renderTable(){
    const el = E(); const term=(el.search?.value||'').toLowerCase(); const users=readUsers().filter(u=>(u.name||'').toLowerCase().includes(term)||(u.username||'').toLowerCase().includes(term));
    el.tbody.innerHTML = users.map(u=>`
      <tr>
        <td>${u.photo?`<img class="avatar" src="${u.photo}">`:'—'}</td>
        <td>${u.name||''}</td>
        <td>${u.username||''}</td>
        <td>${u.role}</td>
        <td>${u.mustChangePassword?'Erstlogin':'Aktiv'}</td>
        <td><button class="btn" data-edit="${u.id}">Bearbeiten</button> <button class="btn-ghost" data-del="${u.id}">Löschen</button></td>
      </tr>`).join('');
    el.tbody.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=>{ const emp=readUsers().find(x=>x.id===b.dataset.edit); if(window.openModal) openModal(emp); editingId = emp?.id || null; }));
    el.tbody.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', ()=> removeEmp(b.dataset.del)));
  }
  function removeEmp(id){
    const me = currentUser();
    const users = readUsers();
    const target = users.find(u=>u.id===id);
    if(!target){ alert('Mitarbeiter nicht gefunden.'); return; }
    if(me && me.id===id){ alert('Du kannst dich nicht selbst löschen.'); return; }
    // mindestens ein Admin muss bleiben
    if(target.role==='admin'){
      const otherAdmins = users.filter(u=>u.role==='admin' && u.id!==id);
      if(otherAdmins.length===0){ alert('Mindestens ein Admin muss verbleiben.'); return; }
    }
    if(!confirm(`Mitarbeiter "${target.name||target.username}" wirklich löschen?`)) return;

    // 1) Nutzer löschen
    const remain = users.filter(u=>u.id!==id);
    writeUsers(remain);

    // 2) Zeiten entfernen
    const times = readTimes(); if(times[id]){ delete times[id]; writeTimes(times); }

    // 3) Planungseinträge entfernen
    const plan = readPlan(); let changed=false;
    Object.keys(plan).forEach(week=>{
      const weekData = plan[week]||{};
      Object.keys(weekData).forEach(date=>{
        const dayObj = weekData[date]||{};
        Object.keys(dayObj).forEach(pid=>{
          const arr = dayObj[pid]||[];
          const arrNew = arr.filter(x=>x.uid!==id);
          if(arrNew.length!==arr.length){ dayObj[pid]=arrNew; changed=true; }
        });
      });
    });
    if(changed) writePlan(plan);

    renderTable();
    alert('Mitarbeiter und zugehörige Einteilungen/Zeiten wurden entfernt.');
  }
  function saveEmp(){
    const el = E();
    const name = el.name.value.trim(); const username = el.user.value.trim(); const role = el.role.value; const pw = el.pw.value;
    const file = el.photo?.files?.[0];
    if(!name || !username){ alert('Name und Nutzername sind erforderlich.'); return; }
    const users = readUsers(); let user = users.find(u=>u.id===editingId);
    const done = (photo)=>{ if(user){ user.name=name; user.username=username; user.role=role; if(pw) user.password=pw; if(photo) user.photo=photo; }
      else{ const id='u'+Math.random().toString(36).slice(2,9); user={id,name,username,role,password:pw||'1234', mustChangePassword:true}; if(photo) user.photo=photo; users.push(user); }
      writeUsers(users); if(window.closeModal) closeModal(); renderTable(); };
    if(file){ const r=new FileReader(); r.onload=()=>done(r.result); r.readAsDataURL(file); } else done(null);
  }
  function initEmployeePage(){
    const el=E();
    el.add?.addEventListener('click', ()=>{ editingId=null; });
    el.save?.addEventListener('click', saveEmp);
    el.search?.addEventListener('input', renderTable);
    renderTable();
  }
  window.initEmployeePage = initEmployeePage;
  window.renderTable = renderTable;
  window.saveEmp = saveEmp;
})();
