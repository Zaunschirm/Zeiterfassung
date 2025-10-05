
(function(){
  let editingId = null;
  const E = ()=> ({
    add: document.getElementById('addEmp'),
    cancel: document.getElementById('cancelEmp'),
    save: document.getElementById('saveEmp'),
    search: document.getElementById('search'),
    modal: document.getElementById('empModal'),
    title: document.getElementById('modalTitle'),
    name: document.getElementById('empName'),
    user: document.getElementById('empUser'),
    role: document.getElementById('empRole'),
    pw: document.getElementById('empPw'),
    photo: document.getElementById('empPhoto'),
    tbody: document.querySelector('#empTable tbody')
  });
  function openModal(emp=null){
    const el = E();
    editingId = emp?.id || null;
    el.title.textContent = editingId ? 'Mitarbeiter bearbeiten' : 'Mitarbeiter anlegen';
    el.name.value = emp?.name || '';
    el.user.value = emp?.username || '';
    el.role.value = emp?.role || 'employee';
    el.pw.value = '';
    if(el.photo) el.photo.value='';
    el.modal.classList.remove('hidden');
  }
  function closeModal(){ E().modal.classList.add('hidden'); }
  function saveEmp(){
    const el = E();
    const name = el.name.value.trim(); const username = el.user.value.trim(); const role = el.role.value; const pw = el.pw.value;
    const file = el.photo?.files?.[0];
    if(!name || !username){ alert('Name und Nutzername sind erforderlich.'); return; }
    const users = readUsers(); let user = users.find(u=>u.id===editingId);
    const upsert = (photo)=>{ if(user){ user.name=name; user.username=username; user.role=role; if(pw) user.password=pw; if(photo) user.photo=photo; }
      else{ const id='u'+Math.random().toString(36).slice(2,9); user={id,name,username,role,password:pw||'1234', mustChangePassword:true}; if(photo) user.photo=photo; users.push(user); }
      writeUsers(users); closeModal(); renderTable(); };
    if(file){ const r=new FileReader(); r.onload=()=>upsert(r.result); r.readAsDataURL(file); } else upsert(null);
  }
  function removeEmp(id){ if(!confirm('Mitarbeiter wirklich löschen?')) return; const users=readUsers().filter(u=>u.id!==id); writeUsers(users); renderTable(); }
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
    el.tbody.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=>{ const emp=readUsers().find(x=>x.id===b.dataset.edit); openModal(emp); }));
    el.tbody.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', ()=> removeEmp(b.dataset.del)));
  }
  function initEmployeePage(){
    const me = currentUser(); if(me?.role!=='admin' && me?.role!=='lead'){ alert('Keine Berechtigung'); location.replace('dashboard.html'); return; }
    const el=E(); el.cancel?.setAttribute('type','button');
    el.add?.addEventListener('click', ()=>openModal());
    el.cancel?.addEventListener('click', (e)=>{ e.preventDefault(); closeModal(); });
    el.save?.addEventListener('click', saveEmp);
    el.search?.addEventListener('input', renderTable);
    el.modal?.addEventListener('click', ev=>{ if(ev.target===el.modal) closeModal(); });
    document.addEventListener('keydown', ev=>{ if(ev.key==='Escape' && !el.modal.classList.contains('hidden')) closeModal(); });
    renderTable();
  }
  window.initEmployeePage = initEmployeePage;
})();
